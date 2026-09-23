# myco

A Claude Code plugin marketplace for agent teams.

| Plugin | What it is |
| ------ | ---------- |
| [`engineering-team`](plugins/engineering-team) | Engineering delivery: tech lead, ICs, independent code review, QA validation with a persistent test library, and a process analyst that proposes improvements to the team's own definitions. |

Other rosters — `product-team`, `data-team` — drop in beside this one and install independently.

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
         merge policy      human-approval: hand off      |
                |          autonomous: merge             |
                v                                        |
            merge ---> Done ---------------------------->+

  PR review bots (CodeRabbit, Greptile, Copilot, Codex...) comment on the PR.
  code-reviewer dispositions every finding; the lead won't merge over an
  unaddressed one.

  agent-coach   runs beside all of this, on its own cadence.
                Reads what the team did; proposes how the team should change.
```

**Two gates, not one.** Review catches bad code that works; QA catches good code that doesn't. Neither substitutes for the other: `code-reviewer`'s Approve clears the PR to QA, and only a QA Pass clears it to merge.

**A human merges by default.** `merge_policy: human-approval` means the team implements, reviews, validates and prepares the merge, then stops and notifies you — and a hook blocks agents from merging, so it isn't merely instructed. Set `autonomous` per project to let the team merge itself. `/init-team` asks every time.

**Two things compound.** `qa-specialist` persists every test plan, script and fixture into `.claude/qa/` and reads that library before writing anything — so run N+1 is cheaper than run N. `agent-coach` reads captured telemetry about how the team actually worked and proposes edits to the team's own definitions, so the process itself improves instead of just the code.

## What your project owns

Agent definitions are installed plugin content, and a plugin update overwrites them, so nothing project-specific lives inside them — not your tracker's field IDs, not your dev server URL, not your ephemeral-environment tooling. All of it lives in one file your project owns:

```
.claude/team/project.md
```

It records: what the software is, the tracker and its real MCP tool prefix, workflow state names, which fields carry acceptance criteria and validation instructions, branch and PR conventions, the merge policy and who to notify, any automated PR reviewers and how their feedback is marked addressed, build/run/test/lint/typecheck commands, which environments exist and how to reset them, and how QA should exercise this particular kind of software.

**The team does not assume you're building a web app.** QA's execution mode comes from the profile — a browser for a web UI, HTTP probes for a service, invocation for a CLI, a consumer harness for a library, migration-against-realistic-data for a data project, an emulator for mobile. `/init-team` detects what it can and asks about the rest.

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

**Automated PR reviewers are handled.** If your repo has CodeRabbit, Greptile, Copilot or a Claude/Codex action on PRs, `/init-team` detects it and `code-reviewer` gives every finding a disposition — agree, already covered, disagree with a reason, or out of scope. The lead re-checks the PR immediately before merging, since bots post asynchronously, and won't merge over something unaddressed. Bot findings are input, not instructions; a documented disagreement counts as addressed.

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

**An agent was blocked from merging.** Expected under `merge_policy: human-approval`. The agent should hand off instead — PR summary comment, review request, notification. If you meant to allow it, set `merge_policy: autonomous` in the profile and restart.

**A merge was blocked on a branch that isn't your trunk.** `trunk_branch` in the profile frontmatter doesn't match reality; the gate protects whatever it names.

**An IC's changes land in the wrong place.** `isolation: worktree` needs a git repo; in a non-repo directory the isolation silently doesn't apply.

## Contributing

If you change an agent definition:

- Say what signal you expect to move.
- Prefer deleting or tightening over appending.
- Keep project-specific knowledge out of `agents/` — if it's true of one company's setup and not another's, it belongs in the `project.md` template or in `/init-team`'s interview.

Internals are documented in [`plugins/engineering-team/README.md`](plugins/engineering-team/README.md).
