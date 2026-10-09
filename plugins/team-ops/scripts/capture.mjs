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
//
// Each record carries the fields every team-ops record shares (context.mjs) and, when
// TEAM_OPS_OTLP_ENDPOINT is set, is also exported as an OTel event (otlp.mjs).
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { streamDir, resolveStreamName } from './stream.mjs';
import { subagentType, resolveContext } from './context.mjs';
import { exportEvent } from './otlp.mjs';

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

  // Only team agents. Plugins are installed per user, so these hooks fire in every
  // session in the project — an orchestrating session, an ad-hoc one. Their events
  // aren't team activity and would skew the coach's numbers. Team agents are
  // plugin agents, and plugin agents are namespaced ("engineering-team:ic-generalist").
  // A subagent's own metadata names it reliably; the hook's agent_type doesn't always.
  const agentType = subagentType(e.transcript_path, e.session_id, e.agent_id) || e.agent_type;
  if (!String(agentType || '').includes(':')) process.exit(0);
  const ctx = resolveContext({ transcriptPath: e.transcript_path, sessionId: e.session_id, agentId: e.agent_id, agentType });

  const ti = e.tool_input || {};

  const rec = {
    ts: new Date().toISOString(),
    event: e.hook_event_name,
    agent: ctx.agent,
    agent_id: e.agent_id,
    session: e.session_id,
    work: ctx.work,
    parent_work: ctx.parent_work,
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

  const dir = streamDir(e.cwd);
  appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(rec) + '\n', 'utf8');
  await exportEvent(dir, resolveStreamName(e.cwd), rec, 'event');
} catch {
  // Telemetry is never worth breaking a run over.
}
process.exit(0);
