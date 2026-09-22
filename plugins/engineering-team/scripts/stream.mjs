// Resolves which event stream a session belongs to, and where it lives on disk.
//
// The stream lives under the user's home directory, NOT in the project: ICs run in
// git worktrees, so a project-relative path would fragment the log into one stream
// per worktree and the analyst would only ever see a fraction of it.
//
// The stream NAME comes from `stream:` in the consuming project's
// .claude/team/project.md frontmatter, which init-team writes. That file is
// committed, so every worktree of the project resolves the same name. If it can't
// be found we fall back to the directory name — telemetry is best-effort and must
// never throw.
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';

export function resolveStreamName(startDir) {
  const start = resolve(startDir || process.cwd());
  let dir = start;
  for (let i = 0; i < 12; i++) {
    try {
      const head = readFileSync(join(dir, '.claude', 'team', 'project.md'), 'utf8').slice(0, 4000);
      const m = head.match(/^stream:[ \t]*["']?([A-Za-z0-9._-]+)["']?[ \t]*$/m);
      if (m) return m[1];
    } catch {
      // keep walking up
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // Unconfigured: fall back to the starting directory's name so two unconfigured
  // projects don't silently share one stream.
  return basename(start) || 'default';
}

export function streamDir(startDir) {
  const d = join(homedir(), '.claude', 'ops', resolveStreamName(startDir));
  mkdirSync(d, { recursive: true });
  return d;
}
