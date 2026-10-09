#!/usr/bin/env node
// Self-report sink. Any agent that hits process friction it can name appends here:
//
//   node "<plugin>/scripts/friction.mjs" --agent ic-generalist --kind instructions \
//     --note "definition says run the test script but names none" [--work CLOUD-123]
//
// kind: instructions | tooling | permissions | scope | environment | handoff
//
// Hooks can see what an agent DID; only the agent knows its instructions were
// unclear. That makes this the highest-signal input the analyst gets.
//
// The record carries the fields every team-ops record shares (context.mjs): the
// session comes from Claude Code's environment, the agent's full name and its unit of
// work from the session's transcripts. --work overrides the work, for a report about
// a package or ticket other than the one in hand; --ticket is its older name.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { streamDir, resolveStreamName } from './stream.mjs';
import { resolveSelf } from './context.mjs';
import { exportEvent } from './otlp.mjs';

const a = process.argv.slice(2);
const get = (f) => {
  const i = a.indexOf(f);
  return i >= 0 ? a[i + 1] : undefined;
};

const note = get('--note');
if (!note) {
  console.error(
    'usage: friction.mjs --agent <name> --kind <instructions|tooling|permissions|scope|environment|handoff> --note "<what cost you time>" [--work <ticket or package slug>]',
  );
  process.exit(1);
}

try {
  const name = get('--agent') || 'unknown';
  let ctx = { agent: name, agent_id: null, session: process.env.CLAUDE_CODE_SESSION_ID || null, work: null, parent_work: null };
  try {
    ctx = resolveSelf(process.env.CLAUDE_CODE_SESSION_ID, name);
  } catch { /* the report matters more than its context */ }
  const work = get('--work') || get('--ticket');
  const rec = {
    ts: new Date().toISOString(),
    agent: ctx.agent,
    agent_id: ctx.agent_id || undefined,
    session: ctx.session || undefined,
    work: work || ctx.work || undefined,
    parent_work: ctx.parent_work || undefined,
    kind: get('--kind') || 'unspecified',
    note: note.slice(0, 1000),
    cwd: process.cwd(),
  };
  const dir = streamDir(process.cwd());
  appendFileSync(join(dir, 'friction.jsonl'), JSON.stringify(rec) + '\n', 'utf8');
  console.log('friction logged');
  await exportEvent(dir, resolveStreamName(process.cwd()), rec, 'friction');
} catch (err) {
  console.error('friction log failed:', err.message);
  process.exit(1);
}
process.exit(0);
