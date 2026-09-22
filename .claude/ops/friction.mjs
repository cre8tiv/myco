#!/usr/bin/env node
// Self-report sink. Any agent that hits process friction it can name appends here:
//   node .claude/ops/friction.mjs --agent ic-generalist --kind instructions --note "..."
// kind: instructions | tooling | permissions | scope | environment | handoff
// Hooks can see what an agent DID; only the agent knows its instructions were unclear.
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STREAM = 'myco';
const a = process.argv.slice(2);
const get = (f) => {
  const i = a.indexOf(f);
  return i >= 0 ? a[i + 1] : undefined;
};

const note = get('--note');
if (!note) {
  console.error('usage: friction.mjs --agent <name> --kind <kind> --note "<what cost you time>" [--ticket KEY]');
  process.exit(1);
}

try {
  const dir = join(homedir(), '.claude', 'ops', STREAM);
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, 'friction.jsonl'),
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
