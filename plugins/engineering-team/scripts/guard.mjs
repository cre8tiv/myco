#!/usr/bin/env node
// PreToolUse guard that makes agent-coach's propose-only mandate structural rather
// than aspirational.
//
// The rule is an allowlist, not a blocklist: the coach may write into
// .claude/ops/reports/ (its report) and scratch/temp locations (working notes), and
// nothing else. It reads everything — agent definitions, transcripts, git history —
// and argues for changes in the report, which a human applies.
//
// An agent that can rewrite the definitions governing agents is an unbounded
// feedback loop, and prompt regressions are silent: no stack trace, just worse work
// three sprints later.
//
// Exit 2 blocks the call and returns stderr to the calling agent. Any internal
// error exits 0 — a broken guard must never block legitimate work.
const read = () =>
  new Promise((res) => {
    let b = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (b += d));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
    setTimeout(() => res(b), 4000);
  });

// Where the coach IS allowed to write.
const ALLOWED = [/\.claude\/ops\/reports\//i, /(^|\/)(tmp|temp)\//i, /\/scratchpad\//i];

const MUTATING_CMD =
  /\b(sed\s+-i|tee|dd|truncate|Set-Content|Out-File|Add-Content|Copy-Item|Move-Item|Remove-Item)\b|\b(cp|mv|rm)\s/i;

try {
  const e = JSON.parse((await read()) || '{}');

  if (e.agent_type === 'agent-coach') {
    const ti = e.tool_input || {};
    const cmd = ti.command || '';
    // Normalize Windows separators so one pattern covers both path styles.
    const blob = [ti.file_path, cmd, ti.notebook_path]
      .filter(Boolean)
      .join(' ')
      .split('\\')
      .join('/');

    const isWrite =
      ['Write', 'Edit', 'NotebookEdit'].includes(e.tool_name) ||
      (e.tool_name === 'Bash' && (MUTATING_CMD.test(cmd) || />{1,2}/.test(cmd)));

    if (isWrite && !ALLOWED.some((re) => re.test(blob))) {
      console.error(
        'Blocked: agent-coach is propose-only. The only place you may write is ' +
          '.claude/ops/reports/. Put the recommendation in your report as a fenced diff ' +
          'and let a human apply it — agent definitions, project config and your own ' +
          'instrumentation are not yours to edit.',
      );
      process.exit(2);
    }
  }
} catch {
  // A broken guard must never block legitimate work.
}
process.exit(0);
