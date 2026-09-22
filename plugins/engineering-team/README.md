# engineering-team

A delivery agent team with two quality gates and a self-improvement loop.

| Agent | Role | Isolation | Writes code? |
| ----- | ---- | --------- | ------------ |
| `tech-lead` | Decomposes goals, delegates, integrates, owns tracker truth | — | Only trivially |
| `ic-generalist` | Takes one scoped task end-to-end | git worktree | Yes |
| `ic-specialist-backend` | Same, with backend/schema/API defaults | git worktree | Yes |
| `code-reviewer` | Independent review of the diff | — | No (enforced) |
| `qa-specialist` | Test plans + execution against a running build | git worktree | Tests only |
| `agent-coach` | Observability and efficiency of the team itself | — | Reports only (enforced) |

Plus one skill, `/init-team`, which profiles the host project and writes the config the agents read.

## The contract with the host project

The agents ship **generic**. Everything project-specific lives in one file the host project owns:

```
.claude/team/project.md      <- tracker, field IDs, states, branch/PR conventions,
                                build & run commands, verification commands,
                                environments, how QA exercises this software
```

Every agent reads it on dispatch. Agent definitions are installed plugin content that a plugin update overwrites, so nothing project-specific can live in them. `/init-team` generates the file; a human edits it thereafter.

Two further project-owned directories, scaffolded by `/init-team`:

```
.claude/qa/                  <- the QA library: plans, scripts, fixtures, run evidence
.claude/ops/reports/         <- agent-coach's dated reports + TRENDS.md
```

## Tools and role boundaries

Agents don't pin a `tools:` list — a pinned list would have to name the host's tracker MCP tools, which differ per installation. Agents inherit the session's tools, and role boundaries are enforced where they matter:

- `code-reviewer` — `disallowedTools: Edit, Write, NotebookEdit`. It reviews; the IC fixes.
- `agent-coach` — `disallowedTools: Edit, NotebookEdit`, plus a `PreToolUse` guard restricting its writes to `.claude/ops/reports/`.

**The limit:** an agent with `Bash` can still write files through the shell. The guard covers the coach's mutating shell commands; for `code-reviewer` the boundary is the frontmatter plus its instructions. Tighten further in project settings if your situation calls for it.

## Observability

| Layer | Mechanism | Cost |
| ----- | --------- | ---- |
| Capture | `scripts/capture.mjs`, wired via `hooks/hooks.json` | zero tokens, one short-lived process per event |
| Self-report | agents call `scripts/friction.mjs` on friction they can name | one line per incident |
| Analysis | `agent-coach`, invoked periodically | one report |

Capture is a hook rather than an agent because hooks fire inside subagents and carry `agent_id` and `agent_type`, which nothing else does — subagent conversations are isolated and aren't written to session transcripts. So the coach can attribute every captured event to the agent that produced it, but sees inside an IC only through this stream and the self-reports.

**Captured events:** `PostToolUseFailure`, `PermissionDenied`, `SubagentStart`, `SubagentStop`, `PreCompact`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `SessionEnd`. Successful tool calls are excluded — a process per tool call across every agent for marginal signal. Add `PostToolUse` to `hooks/hooks.json` temporarily for a full census. `SubagentStop` carries `last_assistant_message`, each agent's own final report, which is the richest field in the stream.

**Where the stream lives:** `~/.claude/ops/<stream>/`, outside the host repo, so worktrees converge on one stream instead of one each. `scripts/stream.mjs` resolves the name from `stream:` in `.claude/team/project.md`, walking up from the working directory — **the profile must be committed** or each worktree falls back to its own directory name.

Reports, by contrast, are committed to the host repo. Their git history is what lets the coach attribute a change in outcomes to a change in a definition or in config.

## Propose-only, enforced

`scripts/guard.mjs` runs on `PreToolUse` with an allowlist: `agent-coach` may write into `.claude/ops/reports/` and scratch locations, and nothing else. It reads everything — agent definitions, transcripts, git history, project config — and argues for changes in a report a human applies.

The guard fails open: any internal error exits 0 rather than blocking legitimate work.

## Files

```
agents/                  six definitions, generic
skills/init-team/        the setup interview
hooks/hooks.json         capture + guard wiring, via ${CLAUDE_PLUGIN_ROOT}
scripts/
  stream.mjs             resolves stream name and directory
  capture.mjs            hook sink
  friction.mjs           agent self-report CLI
  guard.mjs              propose-only enforcement
templates/
  team/project.md        the profile /init-team fills in
  qa/                    QA library scaffold
  ops/reports/           report TEMPLATE.md + TRENDS.md
```

No `.mcp.json` ships with the plugin. `/init-team` adds a Playwright server to the host project's `.mcp.json` only when the project actually has a web surface — a SQL or CLI project shouldn't launch a browser server every session.
