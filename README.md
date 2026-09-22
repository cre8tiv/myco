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

## Verify the install

`/init-team` runs these at the end, but they're worth knowing by hand. `<plugin>` is the installed plugin directory — `/plugin` will show you where it landed.

```sh
# the guard enforces agent-coach's propose-only mandate (expect exit 2)
echo '{"agent_type":"agent-coach","tool_name":"Write","tool_input":{"file_path":".claude/team/project.md"}}' | node "<plugin>/scripts/guard.mjs"; echo "exit=$?"

# ...and leaves every other agent alone (expect exit 0)
echo '{"agent_type":"tech-lead","tool_name":"Edit","tool_input":{"file_path":"src/app.ts"}}' | node "<plugin>/scripts/guard.mjs"; echo "exit=$?"

# self-reporting works, and resolves the stream from your project profile
node "<plugin>/scripts/friction.mjs" --agent init-team --kind tooling --note "smoke test"

# after a session or two of real work, telemetry is accumulating
wc -l ~/.claude/ops/<your-stream>/events.jsonl
```

If that last path doesn't exist but a directory named after your project folder does, `stream:` isn't being read from your profile — see Troubleshooting.

## Working with the team

**Start at the top.** Hand a goal or a ticket to `tech-lead` and let it decompose and delegate; don't dispatch ICs yourself. The lead is what keeps the tracker, the task list, and the branch state in sync.

**Let ICs run.** They're built for long autonomous stretches and message the lead when done, blocked, or when they hit something affecting another IC's work in flight. Polling them defeats the design.

**The gates are sequential on purpose.** QA before review wastes QA's time on code that's about to change on review feedback.

**When a change is user-visible, it goes through QA.** `tech-lead` carries the decision rule — auth, billing, customer data, interface contracts, migrations, anything a human would exercise before believing it. When unsure, it dispatches.

**Invoke `agent-coach` periodically, not per-ticket** — weekly, or after a batch of tickets. Its findings need three or more occurrences to count, so a report covering two tickets is noise. It writes `.claude/ops/reports/<date>-agent-health.md` and appends a row to `TRENDS.md`.

**Edit `project.md`, never the shipped agents.** If an agent keeps getting something wrong about your project, the fix almost always belongs in the profile. Changes to installed agent definitions are overwritten by the next plugin update.

## Re-running init-team

`/init-team` is idempotent and safe to re-run. Do it when commands, tracker fields, workflow states or environments change. It reads the existing profile, confirms what's still true, and won't discard prose a human has added or overwrite accumulated QA plans and reports.

## Troubleshooting

**The agents don't appear.** Confirm the marketplace and plugin are both added (`/plugin`), then restart — plugin components load at session start.

**An agent says the project profile is missing.** Run `/init-team`. The agents refuse to guess at a tracker workflow or a test command, by design.

**Hooks never fire — the event stream stays empty.** They load at session start, so restart after installing. Check `node` is on PATH; the hook commands shell out to it.

**Telemetry lands in a directory named after your project folder.** That's the fallback when `stream:` can't be read from `.claude/team/project.md` — check the key is present in the frontmatter and spelled exactly.

**The event stream is split across several directories.** `.claude/team/project.md` isn't committed, so IC worktrees don't see it and each falls back to its own directory name. Commit the profile.

**`agent-coach` says it can't write a file.** Working as designed — it may write only into `.claude/ops/reports/`. Its proposals are diffs inside the report; a human applies them.

**Tracker transitions fail silently.** The MCP tool prefix recorded in `project.md` doesn't match the server actually available in your session. Check the real prefix and correct the profile.

**`qa-specialist` has no browser tools.** Either `/init-team` judged the project to have no web surface and skipped the Playwright server, or it needs its one-time approval. Both are fine to correct by hand in `.mcp.json`.

**A plugin update reverted a change I made to an agent.** Expected: agent definitions are installed content. Project-specific behavior belongs in `.claude/team/project.md`; if the change is genuinely general, send it upstream as a PR here.

**An IC's changes land in the wrong place.** `isolation: worktree` needs a git repo; in a non-repo directory the isolation silently doesn't apply.

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
