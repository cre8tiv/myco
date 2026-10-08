#!/usr/bin/env node
// Hook: snapshots token usage into the stream's usage.jsonl. Must never fail a run —
// every path exits 0.
//
// Wired to SubagentStop (that subagent, if it's a team agent) and SessionEnd (the
// lead's own usage, if this is a team lead session, plus every subagent). Snapshots
// are cumulative; the report reads only the latest per session and agent, so a
// resumed session or a repeated hook just supersedes the earlier one. When
// TEAM_OPS_OTLP_ENDPOINT is set, the session's usage is also exported (otlp.mjs).
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { streamDir, resolveStreamName } from './stream.mjs';
import { snapshotSession, appendUsage } from './usage-lib.mjs';
import { exportSessions } from './otlp.mjs';

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
  const e = JSON.parse(/** @type {string} */ (await read()) || '{}');
  const transcriptPath = e.transcript_path;
  if (transcriptPath && e.session_id) {
    let records = [];
    if (e.hook_event_name === 'SubagentStop' && e.agent_id) {
      const own = join(dirname(transcriptPath), e.session_id, 'subagents', `agent-${e.agent_id}.jsonl`);
      if (existsSync(own)) records = snapshotSession({ transcriptPath, sessionId: e.session_id, onlyAgentId: e.agent_id });
    } else if (e.hook_event_name === 'SessionEnd') {
      records = snapshotSession({ transcriptPath, sessionId: e.session_id, leadAgent: e.agent_type });
    }
    const dir = streamDir(e.cwd);
    appendUsage(dir, records);
    // The session's whole current usage, so the export stays cumulative per session.
    if (records.length) await exportSessions(dir, resolveStreamName(e.cwd), [e.session_id]);
  }
} catch {
  // Cost accounting is never worth breaking a run over.
}
process.exit(0);
