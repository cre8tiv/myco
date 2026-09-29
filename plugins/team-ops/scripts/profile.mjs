// Reads keys from the host project's team profiles in .claude/team/.
//
// Profiles are written by each team's setup — project.md by engineering-team's
// /init-team, design.md by design-team's /init-design — and either may be absent.
// Keys are looked up in that order at each directory level, walking up from the
// starting directory, so a value resolves identically from the repo root and from
// any IC's git worktree, provided the profile is committed.
//
// Only flat `key: value` pairs in the YAML frontmatter are parsed. Every failure
// returns undefined rather than throwing: callers are hooks.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const PROFILES = ['project.md', 'design.md'];

function frontmatter(path) {
  try {
    const m = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const keys = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/);
      if (!kv) continue;
      const value = kv[2].trim().replace(/^["']|["']$/g, '');
      if (value && !value.startsWith('#') && !value.startsWith('<')) keys[kv[1]] = value;
    }
    return keys;
  } catch {
    return null;
  }
}

export function profileKey(startDir, key, fallback = undefined) {
  let dir = resolve(startDir || process.cwd());
  for (let i = 0; i < 12; i++) {
    for (const name of PROFILES) {
      const keys = frontmatter(join(dir, '.claude', 'team', name));
      if (keys && keys[key] !== undefined) return keys[key];
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return fallback;
}
