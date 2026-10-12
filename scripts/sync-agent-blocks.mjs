#!/usr/bin/env node
// Keeps the text that every agent shares identical, from one source.
//
//   node scripts/sync-agent-blocks.mjs            rewrite agents so every shared block matches its source
//   node scripts/sync-agent-blocks.mjs --check    change nothing; exit 1 if any block is out of date
//
// An agent includes a block by wrapping its text, on one line, in markers:
//
//   <!-- shared:knowledge -->...text...<!-- /shared:knowledge -->
//
// and the canonical text lives in shared/agent-blocks/<name>.md. Agents ship as plain
// markdown, installed as they are, so the markers and the copy stay in each file: this
// script and its test are what stop the copies drifting.
//
// --root <dir> reads plugins/*/agents and shared/agent-blocks below <dir>; used by tests.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const rootAt = argv.indexOf('--root');
const root = rootAt >= 0 ? argv[rootAt + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
const check = argv.includes('--check');

const blocksDir = join(root, 'shared', 'agent-blocks');
/** @type {Map<string, string>} */
const canonical = new Map();
if (existsSync(blocksDir)) {
  for (const f of readdirSync(blocksDir)) {
    if (f.endsWith('.md')) canonical.set(f.slice(0, -3), readFileSync(join(blocksDir, f), 'utf8').replace(/\r?\n+$/, ''));
  }
}
for (const [name, text] of canonical) {
  if (/[\r\n]/.test(text) || text.includes('<!--')) {
    console.error(`shared/agent-blocks/${name}.md must be a single line without comment markers`);
    process.exit(2);
  }
}

const agentsOf = (plugin) => {
  const dir = join(root, 'plugins', plugin, 'agents');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => join(dir, f)) : [];
};
const files = existsSync(join(root, 'plugins')) ? readdirSync(join(root, 'plugins')).flatMap(agentsOf) : [];

const MARKER = /<!-- shared:([\w-]+) -->([\s\S]*?)<!-- \/shared:\1 -->/g;
const problems = [];
const stale = [];
const updated = [];

for (const file of files) {
  const rel = relative(root, file).split('\\').join('/');
  const before = readFileSync(file, 'utf8');
  const opens = [...before.matchAll(/<!-- shared:([\w-]+) -->/g)].map((m) => m[1]);
  const closes = [...before.matchAll(/<!-- \/shared:([\w-]+) -->/g)].map((m) => m[1]);
  if (opens.join() !== closes.join()) problems.push(`${rel}: shared markers are unbalanced (opens: ${opens.join(', ') || 'none'}; closes: ${closes.join(', ') || 'none'})`);

  const after = before.replace(MARKER, (whole, name, body) => {
    if (!canonical.has(name)) {
      problems.push(`${rel}: unknown shared block "${name}" (no shared/agent-blocks/${name}.md)`);
      return whole;
    }
    if (/[\r\n]/.test(body)) {
      problems.push(`${rel}: shared:${name} spans lines; keep it on one line`);
      return whole;
    }
    if (body !== canonical.get(name)) stale.push(`${rel}: shared:${name} is out of date`);
    return `<!-- shared:${name} -->${canonical.get(name)}<!-- /shared:${name} -->`;
  });
  if (after !== before && !check) {
    writeFileSync(file, after);
    updated.push(rel);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(2);
}
if (check) {
  if (stale.length) {
    console.error(stale.join('\n') + '\nRun `npm run sync:agents` and commit the result.');
    process.exit(1);
  }
  console.log(`Shared blocks are in sync across ${files.length} agents.`);
} else {
  console.log(updated.length ? `Updated:\n  ${updated.join('\n  ')}` : 'Already in sync.');
}
