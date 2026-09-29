# team-ops

Observability for agent teams. It captures how every installed team's agents actually work, gives those agents a way to report friction they hit, and provides `agent-coach`, which analyzes both and proposes changes to the teams' definitions and profiles.

You don't install it directly: `engineering-team` and `design-team` depend on it, so it's installed with either. It loads once however many teams depend on it.

| Component | What it does |
| --------- | ------------ |
| `agent-coach` agent | Periodic analysis across every team. Writes one dated report of evidence-backed proposals. Propose-only, enforced. |
| `log-friction` skill | Agents in any team call `team-ops:log-friction` to record process friction they can name. |
| Hooks | Capture tool failures, permission denials, subagent start/stop, compaction, task lifecycle and session ends — tagged by namespaced agent. |

## What gets captured

**Hook events** — `PostToolUseFailure`, `PermissionDenied`, `SubagentStart`, `SubagentStop`, `PreCompact`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `SessionEnd`. Every record carries the namespaced agent that produced it (`engineering-team:ic-generalist`, `design-team:architect`), so one stream covers every team. `SubagentStop` includes each agent's own final report. Successful tool calls are excluded; add `PostToolUse` to `hooks/hooks.json` temporarily for a full census.

**Friction self-reports** — logged by agents through the skill, with a kind: `instructions`, `tooling`, `permissions`, `scope`, `environment`, or `handoff`. The engineering tech lead logs every design problem it routes back to a design package as `handoff`; the design product lead logs specialist rework the same way. Those cross-team handoffs are the strongest signal the coach gets.

**Where it lives** — `~/.claude/ops/<stream>/events.jsonl` and `friction.jsonl`, outside the repo, so every git worktree converges on one stream. The stream name is `stream:` in `.claude/team/project.md`, or in `.claude/team/design.md` if there's no `project.md`, looked up by walking up from the working directory. **The profile must be committed**, or each worktree falls back to its own directory name.

## Running the coach

Invoke `agent-coach` periodically — weekly, or after a batch of work — not per task. Its findings need three or more occurrences to count, so a report covering a couple of tasks is noise.

It writes `.claude/ops/reports/<date>-agent-health.md` in the fixed format from `templates/report-template.md`, and appends a row to `.claude/ops/reports/TRENDS.md`. Commit the reports: their history is how a later report tells whether an applied proposal actually moved anything.

**Propose-only, enforced.** `scripts/coach-guard.mjs` runs on `PreToolUse` and lets the coach write only into `.claude/ops/reports/` and scratch locations. It reads everything and argues for changes in the report; a human applies them. The guard fails open — an internal error never blocks legitimate work.

## Permission prompt on first friction log

The skill runs `node ".../team-ops/scripts/friction.mjs" ...`. The first time an agent logs friction in a session you'll be asked to approve that command. Approve it for the session, or run `/fewer-permission-prompts` to add it to the project allowlist.

## Troubleshooting

**The event stream is empty after real work.** Hooks load at session start — restart after installing. Check `node` is on PATH.

**Telemetry lands in a directory named after the project folder.** `stream:` can't be read from either profile. Check the key is present in the frontmatter and the profile is committed.

**Engineering and design activity are in two different streams.** `project.md` and `design.md` name different streams. Make them match — `project.md` wins when both exist.

**`agent-coach` says it can't write a file.** Working as designed. Its proposals are diffs inside the report.

## Files

```
agents/agent-coach.md
skills/log-friction/SKILL.md
hooks/hooks.json            capture + coach guard, via ${CLAUDE_PLUGIN_ROOT}
scripts/
  capture.mjs               hook sink
  friction.mjs              self-report writer, called by the skill
  coach-guard.mjs           propose-only enforcement
  stream.mjs, profile.mjs   stream resolution from the team profiles
templates/
  report-template.md        the report's fixed format
  TRENDS.md                 seeded into .claude/ops/reports/ on first run
```
