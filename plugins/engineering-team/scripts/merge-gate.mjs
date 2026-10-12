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

// Splits a command line into commands at the separators Bash and PowerShell share
// (; && || | and newlines), honoring quotes and skipping heredoc bodies. Each command
// comes back twice: as written, and with quoted text blanked, so that a commit message
// that mentions `gh pr merge` is not mistaken for running it.
function commands(cmd) {
  /** @type {{raw: string, blank: string}[]} */
  const out = [];
  let raw = '';
  let blank = '';
  let quote = null;
  const flush = () => {
    if (raw.trim()) out.push({ raw: raw.trim(), blank: blank.trim() });
    raw = '';
    blank = '';
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      raw += c;
      if (quote === '"' && c === String.fromCharCode(92) && cmd[i + 1] === '"') raw += cmd[++i];
      else if (c === quote) {
        quote = null;
        blank += '"';
      }
    } else if (c === '"' || c === "'") {
      quote = c;
      raw += c;
      blank += '"';
    } else if (c === '\n' || c === '\r') {
      const heredoc = raw.match(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1/);
      flush();
      if (heredoc && c === '\n') {
        // Skip the body: it is text for the command, not commands.
        let j = i + 1;
        while (j < cmd.length) {
          const end = cmd.indexOf('\n', j);
          const line = cmd.slice(j, end < 0 ? cmd.length : end);
          j = end < 0 ? cmd.length : end + 1;
          if (line.trim() === heredoc[2]) break;
        }
        i = j - 1;
      }
    } else if (c === ';' || c === '|' || (c === '&' && cmd[i + 1] === '&')) {
      flush();
      if (cmd[i + 1] === c) i++;
    } else {
      raw += c;
      blank += c;
    }
  }
  flush();
  return out;
}

// What can precede a command without changing what it is: `FOO=1 gh ...`, `sudo gh ...`.
const PREFIX = /^(?:(?:\w+=\S*|sudo|time|command|&)\s+)+/i;
// `git -C dir push`, `git -c k=v push`: global options between git and the subcommand.
const GIT_PUSH = /^git(?:\s+(?:-C|-c)\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+push\b/i;
const SHELL_C = /^(?:bash|sh|zsh|pwsh|powershell)(?:\.exe)?(?:\s+[^"']*?)?\s+-(?:c|lc|command)\s+(["'])([\s\S]*)\1\s*$/i;

// Does a `git push` command target the trunk? Tokens are checked rather than the raw
// text so every spelling of the destination is caught: `main`, `HEAD:main`,
// `+main`, `HEAD:refs/heads/main`, `'main'`.
function pushesToTrunk(raw, trunk) {
  const tokens = raw.split(/\s+/);
  return tokens.slice(tokens.findIndex((t) => /^push$/i.test(t)) + 1).some((tok) => {
    if (!tok || tok.startsWith('-')) return false;
    const refspec = tok.replace(/^["'`]+|["'`]+$/g, '').replace(/^\+/, '');
    const dest = refspec.slice(refspec.lastIndexOf(':') + 1).replace(/^refs\/heads\//, '');
    return dest === trunk;
  });
}

// Deliberately narrow. `git merge origin/main` into a feature branch is how an IC
// keeps its worktree current and must stay allowed; only completing a PR or pushing
// straight at the trunk is a merge in the sense that needs a human.
function mergeAttempt(cmd, trunk, depth = 0) {
  for (const { raw: rawCmd, blank: blankCmd } of commands(cmd)) {
    const raw = rawCmd.replace(PREFIX, '');
    const blank = blankCmd.replace(PREFIX, '');
    if (/^gh(\.exe)?\s+pr\s+merge\b/i.test(blank)) return 'gh pr merge';
    // The REST endpoint and the GraphQL mutation both complete a PR without `gh pr merge`.
    if (/^gh(\.exe)?\s+api\b/i.test(blank) && /(\/pulls\/\d+\/merge\b|\bmergePullRequest\b)/i.test(raw))
      return 'gh api pull request merge';
    if (/^az\s+repos\s+pr\s+(update|complete|set-auto-complete)\b/i.test(blank) && /\b(completed|complete|--complete|--auto-complete)\b/i.test(raw))
      return 'az repos pr complete';
    if (GIT_PUSH.test(blank) && pushesToTrunk(raw, trunk)) return `git push to ${trunk}`;
    // `bash -c "gh pr merge 1"`: the quoted text is the command here.
    const inner = depth < 3 && raw.match(SHELL_C);
    if (inner) {
      const what = mergeAttempt(inner[2], trunk, depth + 1);
      if (what) return what;
    }
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
