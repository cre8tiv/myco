// Reads the host project's team profile: .claude/team/project.md
//
// Found by walking up from a starting directory, so it resolves identically from
// the repo root and from any IC's git worktree — provided the profile is committed.
// Only the YAML frontmatter is parsed, and only flat `key: value` pairs; the prose
// body is for agents to read, not for tooling.
//
// Every failure returns an empty result rather than throwing. Callers are hooks.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

export function findProfile(startDir) {
  let dir = resolve(startDir || process.cwd());
  for (let i = 0; i < 12; i++) {
    const path = join(dir, '.claude', 'team', 'project.md');
    try {
      const text = readFileSync(path, 'utf8');
      const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (m) {
        const keys = {};
        for (const line of m[1].split(/\r?\n/)) {
          const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/);
          if (!kv) continue;
          const value = kv[2].trim().replace(/^["']|["']$/g, '');
          if (value && !value.startsWith('#')) keys[kv[1]] = value;
        }
        return { path, dir, keys };
      }
    } catch {
      // keep walking up
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return { path: null, dir: null, keys: {} };
}

export function profileKey(startDir, key, fallback = undefined) {
  const v = findProfile(startDir).keys[key];
  return v === undefined ? fallback : v;
}
