# myco

A Claude Code plugin marketplace for agent teams.

| Plugin | What it is |
| ------ | ---------- |
| [`engineering-team`](plugins/engineering-team) | Engineering delivery: tech lead, ICs, independent code review, QA validation with a persistent test library, and a process analyst that proposes improvements to the team's own definitions. |

The `plugins/` layout is deliberate — a `product-team`, `data-team` or any other roster drops in beside this one and installs independently.

## Install

```
/plugin marketplace add cre8tiv/myco
/plugin install engineering-team@myco
/init-team
```

`/init-team` is the part that matters. The agents ship generic; that skill profiles your project — stack, test commands, tracker, environments — and writes the one config file the agents read. Without it they'll tell you they're unconfigured rather than guess at your workflow.

To try it before installing:

```sh
git clone https://github.com/cre8tiv/myco
claude --plugin-dir myco/plugins/engineering-team
```

## What you get

```
  user
    |
    v
tech-lead  ----------------------------------------------+   owns the plan, decomposes,
    |  delegates                                         |   delegates, integrates.
    |                                                    |   Never merges unreviewed work.
    +---> ic-generalist           (worktree, branch/PR)  |
    +---> ic-specialist-backend   (worktree, branch/PR)  |
                |                                        |
                | reports done                           |
                v                                        |
        code-reviewer      gate 1: reads the diff        |
                |          Approve / Request changes     |
                v                                        |
        qa-specialist      gate 2: exercises the build   |
                |          Pass / Fail / Blocked         |
                v                                        |
            merge ---> Done ---------------------------->+

  agent-coach   runs beside all of this, on its own cadence.
                Reads what the team did; proposes how the team should change.
```

**Two gates, not one.** Review catches bad code that works; QA catches good code that doesn't. Neither substitutes for the other: `code-reviewer`'s Approve clears the PR to QA, and only a QA Pass clears it to merge.

**Two things compound.** `qa-specialist` persists every test plan, script and fixture into `.claude/qa/` and reads that library before writing anything — so run N+1 is cheaper than run N. `agent-coach` reads captured telemetry about how the team actually worked and proposes edits to the team's own definitions, so the process itself improves instead of just the code.

## The generic/specific split

This is the design decision everything else follows from.

Agent definitions are **installed plugin content**. A plugin update overwrites them. So nothing project-specific can live inside them — not your tracker's field IDs, not your dev server URL, not your ephemeral-environment tooling. All of it lives in one file your project owns:

```
.claude/team/project.md
```

It records: what the software is, the tracker and its real MCP tool prefix, workflow state names, which fields carry acceptance criteria and validation instructions, branch and PR conventions, build/run/test/lint/typecheck commands, which environments exist and how to reset them, and how QA should exercise this particular kind of software.

That last one matters more than it looks. **The team does not assume you're building a web app.** QA's execution mode is a project fact, not a team fact — a browser for a web UI, HTTP probes for a service, invocation for a CLI, a consumer harness for a library, migration-against-realistic-data for a data project, an emulator for mobile. `/init-team` detects what it can and asks about the rest.

Two more directories your project owns, scaffolded by `/init-team`:

| Path | Committed? | Why |
| ---- | ---------- | --- |
| `.claude/team/project.md` | Yes | The profile the agents read |
| `.claude/qa/plans`, `scripts`, `fixtures` | Yes | Project assets; merge with the change they cover |
| `.claude/qa/runs/**` captures | No | Heavy; referenced by path from run reports |
| `.claude/ops/reports/*.md` | Yes | The durable artifact; history enables attribution |
| `~/.claude/ops/<stream>/*.jsonl` | No (outside repo) | Machine-local telemetry, contains command lines |

## Re-running init-team

`/init-team` is idempotent and safe to re-run. Do it when commands, tracker fields, workflow states or environments change. It reads the existing profile, confirms what's still true, and won't discard prose a human has added or overwrite accumulated QA plans and reports.

## Design notes

**The process observer is a hook, not an agent.** An agent cannot watch another agent work — subagent conversations are isolated and never written to session transcripts (a scan of 181 local transcripts found zero sidechain records). Hooks *do* fire inside subagents and carry `agent_id` and `agent_type`. So capture is a hook: deterministic, zero-token, always on. Analysis is an agent that reads what was captured. "Parallel observer" becomes "continuous capture, periodic analyst."

**`agent-coach` proposes and never applies.** Enforced by a `PreToolUse` guard that allows it to write only into `.claude/ops/reports/`, not by instruction alone. An agent that rewrites the definitions governing agents is an unbounded feedback loop, and prompt regressions are silent — you don't get a stack trace, you get worse work three sprints later.

**Agents don't pin a `tools:` list.** Pinning one would mean naming your tracker's MCP tools, which differ per installation and fail silently when wrong. Agents inherit the session's tools; role boundaries use `disallowedTools` where they matter (`code-reviewer` cannot edit files) plus the coach's guard.

More detail in [`plugins/engineering-team/README.md`](plugins/engineering-team/README.md).

## Contributing

Agent definitions are prompts, and prompt changes regress silently. If you change one:

- Say what signal you expect to move. `agent-coach`'s report format exists to make that checkable.
- Prefer deleting or tightening over appending. Every line in a definition is paid for on every run of that agent, forever.
- Keep project-specific knowledge out of `agents/` — if it's true of one company's setup and not another's, it belongs in the `project.md` template or in `/init-team`'s interview.
