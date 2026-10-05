# team-ops

Observability for agent teams. It captures how every installed team's agents actually work, gives those agents a way to report friction they hit, and provides `agent-coach`, which analyzes both and proposes changes to the teams' definitions and profiles.

You don't install it directly: `engineering-team` and `design-team` depend on it, so it's installed with either. It loads once however many teams depend on it.

| Component | What it does |
| --------- | ------------ |
| `agent-coach` agent | Periodic analysis across every team. Writes one dated report of evidence-backed proposals. Propose-only, enforced. |
| `log-friction` skill | Agents in any team call `team-ops:log-friction` to record process friction they can name. |
| `init-knowledge` skill | Records the docs and knowledge bases every team should consult in `.claude/team/knowledge.md`. Run by `/init-design` and `/init-team`; run it directly to refresh. |
| Hooks | Capture tool failures, permission denials, subagent start/stop, compaction, task lifecycle and session ends — tagged by namespaced agent. |

## What gets captured

**Hook events** — `PostToolUseFailure`, `PermissionDenied`, `SubagentStart`, `SubagentStop`, `PreCompact`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `SessionEnd`. Every record carries the namespaced agent that produced it (`engineering-team:ic-generalist`, `design-team:architect`), so one stream covers every team. Only plugin agents are captured: plugins are installed per user, so the hooks fire in every session in the project, and a plain or orchestrating session's events aren't team activity. `SubagentStop` includes each agent's own final report. Successful tool calls are excluded; add `PostToolUse` to `hooks/hooks.json` temporarily for a full census.

**Friction self-reports** — logged by agents through the skill, with a kind: `instructions`, `tooling`, `permissions`, `scope`, `environment`, or `handoff`. The engineering tech lead logs every design problem it routes back to a design package as `handoff`; the design product lead logs specialist rework the same way. Those cross-team handoffs are the strongest signal the coach gets.

**Where it lives** — `~/.claude/ops/<stream>/events.jsonl` and `friction.jsonl`, outside the repo, so every git worktree converges on one stream. The stream name is `stream:` in `.claude/team/project.md`, or in `.claude/team/design.md` if there's no `project.md`, looked up by walking up from the working directory. **The profile must be committed**, or each worktree falls back to its own directory name.

## Knowledge sources

`.claude/team/knowledge.md` is the one list, shared by every team, of the documentation and knowledge sources agents consult before inferring from the code or from memory: product docs, API references, internal engineering docs, knowledge graphs, runbooks. Each row says how to reach the source (an MCP server, a URL, or a repo path), **what questions it answers**, which roles use it, how authoritative it is, and whether it needs authorizing.

`/init-knowledge` builds it. It looks at every connected MCP server rather than a fixed list of types, so a server named after your product or an internal system gets found, and asks what each unrecognized one is for. It flags connectors that are configured but not authorized: authorization is per person, so each teammate authorizes once through claude.ai **Settings → Connectors** or `/mcp`.

*Authority* matters most to the design team: a capability documented in an *authoritative* source, such as the product's published docs, is something a design can build on as a supported contract; one found only in an *internal* source isn't.

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
skills/init-knowledge/SKILL.md
hooks/hooks.json            capture + coach guard, via ${CLAUDE_PLUGIN_ROOT}
scripts/
  capture.mjs               hook sink
  friction.mjs              self-report writer, called by the skill
  coach-guard.mjs           propose-only enforcement
  stream.mjs, profile.mjs   stream resolution from the team profiles
templates/
  report-template.md        the report's fixed format
  knowledge.md              becomes .claude/team/knowledge.md
  TRENDS.md                 seeded into .claude/ops/reports/ on first run
```
