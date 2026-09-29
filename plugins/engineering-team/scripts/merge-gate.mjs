#!/usr/bin/env node
// PreToolUse merge gate.
//
// When the project profile sets `merge_policy: human-approval` (or doesn't set it —
// a missing profile resolves to gated), no agent may merge a PR or push to the
// trunk. The agent prepares the merge and hands off; a human performs it.
//
// Keyed on `agent_type`, so a human working in a plain session is unaffected — the
// gate is on autonomous merges, not on the person who asked for one.
//
// Exit 2 blocks the call and returns stderr to the calling agent. Any internal
// error exits 0 — a broken gate must never block legitimate work.
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
  if (e.agent_type && e.tool_name === 'Bash') {
    const policy = (profileKey(e.cwd, 'merge_policy', 'human-approval') || '').toLowerCase();
    if (policy !== 'autonomous') {
      const trunk = profileKey(e.cwd, 'trunk_branch', 'main') || 'main';
      const what = mergeAttempt(e.tool_input?.command || '', trunk);
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
  // A broken gate must never block legitimate work.
}
process.exit(0);
