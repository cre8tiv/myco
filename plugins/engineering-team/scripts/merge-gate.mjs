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

// Shell tools whose commands are inspected. PowerShell is how agents run commands on
// Windows, so it gets the same scrutiny as Bash.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

// Does a `git push` segment target the trunk? Tokens are checked rather than the raw
// text so every spelling of the destination is caught: `main`, `HEAD:main`,
// `+main`, `HEAD:refs/heads/main`, `'main'`.
function pushesToTrunk(segment, trunk) {
  const tokens = segment.split(/\s+/).slice(2); // after `git push`
  return tokens.some((tok) => {
    if (!tok || tok.startsWith('-')) return false;
    const refspec = tok.replace(/^["'`]+|["'`]+$/g, '').replace(/^\+/, '');
    const dest = refspec.slice(refspec.lastIndexOf(':') + 1).replace(/^refs\/heads\//, '');
    return dest === trunk;
  });
}

// Deliberately narrow. `git merge origin/main` into a feature branch is how an IC
// keeps its worktree current and must stay allowed; only completing a PR or pushing
// straight at the trunk is a merge in the sense that needs a human.
function mergeAttempt(cmd, trunk) {
  if (/\bgh(\.exe)?\s+pr\s+merge\b/i.test(cmd)) return 'gh pr merge';
  // The REST endpoint and the GraphQL mutation both complete a PR without `gh pr merge`.
  if (/\bgh(\.exe)?\s+api\b[\s\S]*(\/pulls\/\d+\/merge\b|\bmergePullRequest\b)/i.test(cmd))
    return 'gh api pull request merge';
  if (/\baz\s+repos\s+pr\s+(update|complete)\b[\s\S]*\b(completed|--complete)\b/i.test(cmd))
    return 'az repos pr complete';
  // Split on command separators common to Bash and PowerShell, so `git push` is judged
  // on its own arguments and not on whatever else is on the line.
  for (const segment of cmd.split(/&&|\|\||[;|\r\n]/)) {
    const s = segment.trim();
    if (/^git\s+push\b/i.test(s) && pushesToTrunk(s, trunk)) return `git push to ${trunk}`;
  }
  return null;
}

// A merge or completion tool exposed by an MCP server (GitHub, Azure DevOps, ...).
function mcpMergeAttempt(toolName, input) {
  if (!/^mcp__/i.test(toolName)) return null;
  if (/merge/i.test(toolName)) return toolName;
  if (/pull_?request/i.test(toolName) && /^(completed|complete)$/i.test(String(input?.status || '')))
    return `${toolName} (status: completed)`;
  return null;
}

try {
  const e = JSON.parse((await read()) || '{}');
  if (e.agent_type) {
    const policy = (profileKey(e.cwd, 'merge_policy', 'human-approval') || '').toLowerCase();
    if (policy !== 'autonomous') {
      const trunk = profileKey(e.cwd, 'trunk_branch', 'main') || 'main';
      const what = SHELL_TOOLS.has(e.tool_name)
        ? mergeAttempt(e.tool_input?.command || '', trunk)
        : mcpMergeAttempt(e.tool_name || '', e.tool_input);
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
