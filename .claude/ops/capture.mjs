#!/usr/bin/env node
// Hook sink: reads one hook event as JSON on stdin, appends a compact record to
// the shared event stream. Must never fail a tool call — every path exits 0.
//
// The stream lives under the user's home dir, NOT in the repo, on purpose: ICs run
// in git worktrees, so a repo-relative path would fragment the log into one stream
// per worktree. STREAM is the only thing that ties them together.
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STREAM = 'myco';
const cap = (v, n) => (typeof v === 'string' && v.length > n ? v.slice(0, n) + '…' : v);

const read = () =>
  new Promise((res) => {
    let b = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (b += d));
    process.stdin.on('end', () => res(b));
    process.stdin.on('error', () => res(''));
    setTimeout(() => res(b), 4000);
  });

try {
  const raw = await read();
  const e = JSON.parse(raw || '{}');
  const ti = e.tool_input || {};

  const rec = {
    ts: new Date().toISOString(),
    event: e.hook_event_name,
    // Who: "main" when the hook fired outside a subagent.
    agent: e.agent_type || 'main',
    agent_id: e.agent_id,
    session: e.session_id,
    cwd: e.cwd,
    mode: e.permission_mode,
    effort: e.effort?.level,
    tool: e.tool_name,
    // One representative argument per tool, so a finding is traceable to a command.
    target: cap(ti.command || ti.file_path || ti.pattern || ti.url || ti.subagent_type, 300),
    error: cap(
      typeof e.tool_response === 'string' ? e.tool_response : e.error || e.message,
      600,
    ),
    reason: cap(e.permission_decision_reason || e.reason, 300),
    // SubagentStop carries the agent's own final report — the single richest field here.
    report: cap(e.last_assistant_message, 1200),
    task: e.task?.description || e.description,
  };
  for (const k of Object.keys(rec)) if (rec[k] === undefined || rec[k] === null) delete rec[k];

  const dir = join(homedir(), '.claude', 'ops', STREAM);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(rec) + '\n', 'utf8');
} catch {
  // Telemetry is never worth breaking a run over.
}
process.exit(0);
