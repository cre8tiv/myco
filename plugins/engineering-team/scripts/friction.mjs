#!/usr/bin/env node
// Self-report sink. Any agent that hits process friction it can name appends here:
//
//   node "<plugin>/scripts/friction.mjs" --agent ic-generalist --kind instructions \
//     --ticket ABC-123 --note "definition says run the test script but names none"
//
// kind: instructions | tooling | permissions | scope | environment | handoff
//
// Hooks can see what an agent DID; only the agent knows its instructions were
// unclear. That makes this the highest-signal input the analyst gets.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { streamDir } from './stream.mjs';

const a = process.argv.slice(2);
const get = (f) => {
  const i = a.indexOf(f);
  return i >= 0 ? a[i + 1] : undefined;
};

const note = get('--note');
if (!note) {
  console.error(
    'usage: friction.mjs --agent <name> --kind <instructions|tooling|permissions|scope|environment|handoff> --note "<what cost you time>" [--ticket KEY]',
  );
  process.exit(1);
}

try {
  appendFileSync(
    join(streamDir(process.cwd()), 'friction.jsonl'),
    JSON.stringify({
      ts: new Date().toISOString(),
      agent: get('--agent') || 'unknown',
      kind: get('--kind') || 'unspecified',
      ticket: get('--ticket'),
      note: note.slice(0, 1000),
      cwd: process.cwd(),
    }) + '\n',
    'utf8',
  );
  console.log('friction logged');
} catch (err) {
  console.error('friction log failed:', err.message);
  process.exit(1);
}
