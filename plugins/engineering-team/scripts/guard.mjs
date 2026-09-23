#!/usr/bin/env node
// PreToolUse guard. Two rules, both enforcing a boundary that instructions alone
// would let an agent quietly forget.
//
// 1. agent-coach is propose-only. Allowlist: it may write into
//    .claude/ops/reports/ and scratch locations, nothing else.
//
// 2. When the project profile sets `merge_policy: human-approval`, no agent may
//    merge a PR or push to the trunk. The agent prepares the merge and hands off;
//    a human performs it. This is checked on `agent_type`, so a human working in
//    the main session is unaffected — the gate is on autonomous merges, not on the
//    person who asked for one.
//
// Exit 2 blocks the call and returns stderr to the calling agent. Any internal
// error exits 0 — a broken guard must never block legitimate work.
import { profileKey } from './profile.mjs';

const read = () =>
  new Promise((res) => {
    let b = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (b += d));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
    setTimeout(() => res(b), 4000);
  });

// Where agent-coach IS allowed to write.
const COACH_ALLOWED = [/\.claude\/ops\/reports\//i, /(^|\/)(tmp|temp)\//i, /\/scratchpad\//i];

const MUTATING_CMD =
  /\b(sed\s+-i|tee|dd|truncate|Set-Content|Out-File|Add-Content|Copy-Item|Move-Item|Remove-Item)\b|\b(cp|mv|rm)\s/i;

// Deliberately narrow. `git merge origin/main` into a feature branch is how an IC
// keeps its worktree current and must stay allowed; only completing a PR or pushing
// straight at the trunk is a merge in the sense that needs a human.
function mergeAttempt(cmd, trunk) {
  if (/\bgh\s+pr\s+merge\b/i.test(cmd)) return 'gh pr merge';
  if (/\baz\s+repos\s+pr\s+(update|complete)\b[\s\S]*\b(completed|--complete)\b/i.test(cmd))
    return 'az repos pr complete';
  if (/\bgit\s+push\b/i.test(cmd)) {
    const t = trunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\bgit\\s+push\\b[^&|;]*(\\s|:)${t}(\\s|$)`, 'i').test(cmd))
      return `git push to ${trunk}`;
  }
  return null;
}

try {
  const e = JSON.parse((await read()) || '{}');
  const agent = e.agent_type;
  const ti = e.tool_input || {};
  const cmd = ti.command || '';

  // ---- rule 1: agent-coach is propose-only -------------------------------
  if (agent === 'agent-coach') {
    const blob = [ti.file_path, cmd, ti.notebook_path].filter(Boolean).join(' ').split('\\').join('/');
    const isWrite =
      ['Write', 'Edit', 'NotebookEdit'].includes(e.tool_name) ||
      (e.tool_name === 'Bash' && (MUTATING_CMD.test(cmd) || />{1,2}/.test(cmd)));

    if (isWrite && !COACH_ALLOWED.some((re) => re.test(blob))) {
      console.error(
        'Blocked: agent-coach is propose-only. The only place you may write is ' +
          '.claude/ops/reports/. Put the recommendation in your report as a fenced diff ' +
          'and let a human apply it — agent definitions, project config and your own ' +
          'instrumentation are not yours to edit.',
      );
      process.exit(2);
    }
  }

  // ---- rule 2: human approval before merge -------------------------------
  // Only applies inside an agent. A human in the main session merges freely.
  if (agent && e.tool_name === 'Bash') {
    const policy = (profileKey(e.cwd, 'merge_policy', 'human-approval') || '').toLowerCase();
    if (policy !== 'autonomous') {
      const trunk = profileKey(e.cwd, 'trunk_branch', 'main') || 'main';
      const what = mergeAttempt(cmd, trunk);
      if (what) {
        console.error(
          `Blocked: this project's merge_policy is "${policy}", so merging is a human's ` +
            `action, not yours (attempted: ${what}). Finish the handoff instead — post the ` +
            'review and QA verdicts on the PR, request review from the human named in ' +
            '.claude/team/project.md, send the notification recorded there, and report that ' +
            'the PR is ready to merge. Leave the ticket in its review/validated state.',
        );
        process.exit(2);
      }
    }
  }
} catch {
  // A broken guard must never block legitimate work.
}
process.exit(0);
