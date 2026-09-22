#!/usr/bin/env node
// Hook sink. Reads one hook event as JSON on stdin and appends a compact record to
// the project's event stream. Must never fail a tool call — every path exits 0.
//
// Wired to: PostToolUseFailure, PermissionDenied, SubagentStart, SubagentStop,
// PreCompact, TaskCreated, TaskCompleted, StopFailure, SessionEnd.
//
// Successful tool calls are deliberately not captured: that would spawn a process
// per tool call across every agent for a marginal signal. Add PostToolUse to
// hooks.json temporarily if you want a full tool census for a stretch.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { streamDir } from './stream.mjs';

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
  const e = JSON.parse((await read()) || '{}');
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
    error: cap(typeof e.tool_response === 'string' ? e.tool_response : e.error || e.message, 600),
    reason: cap(e.permission_decision_reason || e.reason, 300),
    // SubagentStop carries the agent's own final report — the richest field here.
    report: cap(e.last_assistant_message, 1200),
    task: e.task?.description || e.description,
  };
  for (const k of Object.keys(rec)) if (rec[k] === undefined || rec[k] === null) delete rec[k];

  appendFileSync(join(streamDir(e.cwd), 'events.jsonl'), JSON.stringify(rec) + '\n', 'utf8');
} catch {
  // Telemetry is never worth breaking a run over.
}
process.exit(0);
