#!/usr/bin/env node
// PreToolUse guard that makes agent-coach's propose-only mandate structural.
//
// Allowlist: the coach may write into .claude/ops/reports/ and scratch locations,
// and nothing else. It reads everything — agent definitions, transcripts, git
// history, team profiles — and argues for changes in a report a human applies.
//
// Plugin agents arrive namespaced ("team-ops:agent-coach"), so the role is matched
// after the last colon; a bare name matches too.
//
// Exit 2 blocks the call and returns stderr to the agent. Any internal error exits
// 0 — a broken guard must never block legitimate work.
const read = () =>
  new Promise((res) => {
    let b = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (b += d));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
    setTimeout(() => res(b), 4000);
  });

const ALLOWED = [/\.claude\/ops\/reports\//i, /(^|\/)(tmp|temp)\//i, /\/scratchpad\//i];

const MUTATING_CMD =
  /\b(sed\s+-i|tee|dd|truncate|Set-Content|Out-File|Add-Content|Copy-Item|Move-Item|Remove-Item)\b|\b(cp|mv|rm)\s/i;

try {
  const e = JSON.parse((await read()) || '{}');
  const role = (e.agent_type || '').split(':').pop();

  if (role === 'agent-coach') {
    const ti = e.tool_input || {};
    const cmd = ti.command || '';
    const blob = [ti.file_path, cmd, ti.notebook_path].filter(Boolean).join(' ').split('\\').join('/');
    const isWrite =
      ['Write', 'Edit', 'NotebookEdit'].includes(e.tool_name) ||
      (e.tool_name === 'Bash' && (MUTATING_CMD.test(cmd) || />{1,2}/.test(cmd)));

    if (isWrite && !ALLOWED.some((re) => re.test(blob))) {
      console.error(
        'Blocked: agent-coach is propose-only. The only place you may write is ' +
          '.claude/ops/reports/. Put the recommendation in your report as a fenced diff ' +
          'and let a human apply it — agent definitions, team profiles and your own ' +
          'instrumentation are not yours to edit.',
      );
      process.exit(2);
    }
  }
} catch {
  // A broken guard must never block legitimate work.
}
process.exit(0);
