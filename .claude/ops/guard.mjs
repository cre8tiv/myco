#!/usr/bin/env node
// PreToolUse guard that makes agent-coach's propose-only mandate structural rather
// than aspirational. The coach may read every agent definition and propose diffs;
// it may not write one. Exit 2 blocks the call and returns stderr to the agent.
const read = () =>
  new Promise((res) => {
    let b = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (b += d));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
    setTimeout(() => res(b), 4000);
  });

const PROTECTED = /\.claude\/(agents|settings(\.local)?\.json|ops\/(capture|friction|guard)\.mjs)/i;
const MUTATING_CMD =
  /\b(sed\s+-i|tee|cp|mv|rm|dd|truncate|Set-Content|Out-File|Add-Content|Copy-Item|Move-Item|Remove-Item)\b/i;

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

    if (isWrite && PROTECTED.test(blob)) {
      console.error(
        'Blocked: agent-coach is propose-only. Put the recommendation in the report ' +
          'under .claude/ops/reports/ as a fenced diff and let a human apply it. Agent ' +
          'definitions, settings.json and the ops scripts are not yours to edit.',
      );
      process.exit(2);
    }
  }
} catch {
  // A broken guard must never block legitimate work.
}
process.exit(0);
