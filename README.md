# Agent team

A reusable Claude Code agent team for engineering work: planning and delegation, implementation, independent code review, QA validation, and a process analyst that watches how the team itself performs and proposes improvements to its own definitions.

It is designed to be dropped into a project repo and adapted. Nothing here is specific to a language or framework, but a handful of values *are* specific to the org it came from — see [Adapt it to your project](#adapt-it-to-your-project), which is the section that matters most on first install.

## The pipeline

```
  user
    |
    v
tech-lead  ----------------------------------------------+   owns the plan, decomposes,
    |  delegates                                         |   delegates, integrates.
    |                                                    |   Never merges unreviewed work.
    +---> ic-generalist           (worktree, branch/PR)   |
    +---> ic-specialist-backend   (worktree, branch/PR)   |
                |                                         |
                | reports done                            |
                v                                         |
        code-reviewer      gate 1: reads the diff         |
                |          Approve / Request changes      |
                v                                         |
        qa-specialist      gate 2: exercises the build    |
                |          Pass / Fail / Blocked          |
                v                                         |
            merge ---> Done ----------------------------->+

  agent-coach   runs beside all of this, on its own cadence.
                Reads what the team did; proposes how the team should change.
```

**Two gates, not one.** Review catches bad code that works; QA catches good code that doesn't. Neither substitutes for the other, and neither is a formality — `code-reviewer`'s Approve clears the PR to QA, and only a QA Pass clears it to merge.

## The roster

| Agent | Role | Isolation | Writes code? |
| ----- | ---- | --------- | ------------ |
| `tech-lead` | Decomposes goals, delegates, integrates, owns Jira truth | — | Only trivially |
| `ic-generalist` | Takes one scoped task end-to-end | git worktree | Yes |
| `ic-specialist-backend` | Same, with backend/schema/API defaults | git worktree | Yes |
| `code-reviewer` | Independent review of the diff | — | No |
| `qa-specialist` | Test plans + execution against a running build | git worktree | Tests only |
| `agent-coach` | Observability and efficiency of the team itself | — | No (enforced) |

The ICs run in isolated git worktrees, so parallel work never collides in one working directory. **This requires the consuming project to be a git repo.**

## Install

### Today: copy into your project

```sh
# from your project root
cp -r /path/to/agent-team/.claude/agents  .claude/
cp -r /path/to/agent-team/.claude/ops     .claude/
cp -r /path/to/agent-team/.claude/qa      .claude/

# hooks: merge into your existing settings.json rather than overwriting it
cp .claude/ops/hooks.settings.json .claude/settings.json   # only if you have none

# browser automation for qa-specialist
cp /path/to/agent-team/.mcp.json .mcp.json                 # or merge the playwright entry
```

Then restart Claude Code — hooks and MCP servers load at session start, and the project-scoped MCP server prompts once for approval.

### Recommended: publish as a plugin

Claude Code plugins are the native distribution mechanism and can ship agents, hooks, MCP servers and support scripts together. One git repo serves as both marketplace and plugin:

```
agent-team/
  .claude-plugin/
    marketplace.json          # catalog: name, owner, plugins[]
  plugins/engineering-team/
    .claude-plugin/plugin.json
    agents/                   # the six definitions
    hooks/hooks.json          # capture + guard wiring
    scripts/                  # capture.mjs, friction.mjs, guard.mjs
    .mcp.json                 # playwright
```

Consumers then run:

```sh
/plugin marketplace add your-org/agent-team
/plugin install engineering-team@your-org
```

Two reasons to prefer this over copying, beyond convenience:

1. **It fixes a real fragility.** The hook commands here are written as `node .claude/ops/capture.mjs`, which resolves against the working directory — and ICs run in worktrees with a different one. A plugin resolves them as `${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs`, which is correct everywhere.
2. **Updates become a version bump** instead of a re-copy that silently reverts local adaptations.

What a plugin should *not* ship is the accumulated project data: `.claude/qa/` contents and `.claude/ops/reports/`. Those belong in the consuming repo, committed alongside the code they describe. The plugin ships the team; the project owns what the team learns.

## Adapt it to your project

These values came from the originating org. Change them before first real use — most fail silently rather than loudly.

| Where | Value | Change to |
| ----- | ----- | --------- |
| `ops/capture.mjs`, `ops/friction.mjs` | `const STREAM = 'myco'` | Your project slug. **Both files must match** or the coach reads half the data. |
| `agents/agent-coach.md` | `~/.claude/ops/myco/...` (2 places) | Same slug as above. |
| `ops/README.md` | `~/.claude/ops/myco/...` (2 places) | Same slug. |
| All agent frontmatter | `Atlassian Rovo:transitionJiraIssue` etc. | **The tool name must match your Jira MCP server's name.** If your server is `atlassian`, these become `mcp__atlassian__transitionJiraIssue`. A wrong name means the agent quietly lacks the tool. |
| `agents/qa-specialist.md` | `customfield_10247` (acceptance criteria), `customfield_10201` (validation instructions) | Your Jira field IDs, or drop the references. |
| `agents/qa-specialist.md`, `qa/README.md` | `http://localhost:44302` | Your dev server URL. |
| `agents/qa-specialist.md` | `cleanup-bse`, `create-test-plan`, "BSE" | Your equivalent skills and ephemeral-environment concept, or remove. |
| `agents/tech-lead.md`, `agents/ic-*.md` | `In Progress` / `In Review` / `Done`, `feature/JIRA-1234-...` | Your Jira workflow states and branch convention. |
| All agent frontmatter | `model: claude-opus-5`, `claude-sonnet-5` | Your preference. The gate roles (`code-reviewer`, `qa-specialist`, `agent-coach`) benefit most from the stronger model. |
| `.mcp.json` | `--output-dir .claude/qa/runs/_artifacts` | Keep, unless you move the QA library. |

If you don't use Jira at all, strip the Jira tools and status transitions from all five delivery agents — the review/QA gate structure stands on its own without ticket tracking.

## Verify the install

```sh
# 1. hooks are syntactically valid
node -e "console.log(Object.keys(require('./.claude/settings.json').hooks).length + ' hook events')"

# 2. the guard blocks the coach from editing agent definitions (expect: exit 2)
echo '{"agent_type":"agent-coach","tool_name":"Edit","tool_input":{"file_path":".claude/agents/tech-lead.md"}}' | node .claude/ops/guard.mjs; echo "exit=$?"

# 3. the guard leaves everyone else alone (expect: exit 0)
echo '{"agent_type":"tech-lead","tool_name":"Edit","tool_input":{"file_path":".claude/agents/tech-lead.md"}}' | node .claude/ops/guard.mjs; echo "exit=$?"

# 4. self-reporting works
node .claude/ops/friction.mjs --agent ic-generalist --kind tooling --note "install smoke test"

# 5. after a session or two of real work, the stream has content
wc -l ~/.claude/ops/<your-slug>/events.jsonl
```

Step 5 returning zero after real work means hooks aren't firing — see [Troubleshooting](#troubleshooting).

## Working with the team

**Start at the top.** Hand a goal or a ticket to `tech-lead` and let it decompose and delegate; don't dispatch ICs yourself. The lead is what keeps Jira, the task list, and the branch state in sync.

**Let ICs run.** They're built for long autonomous stretches and will message the lead when done, blocked, or when they hit something affecting another IC's work in flight. Polling them defeats the design.

**The gates are sequential on purpose.** QA before review wastes QA's time on code that's about to change on review feedback.

**When a change is user-visible, it goes through QA.** `tech-lead` has an explicit decision rule for this (auth, billing, customer data, API contracts, migrations, anything a human would click before believing). When unsure, it dispatches.

**Invoke `agent-coach` periodically, not per-ticket** — weekly, or after a batch of tickets. It needs enough traffic for its three-occurrence threshold to mean anything; a report covering two tickets is noise. It writes `.claude/ops/reports/<date>-agent-health.md` and appends a row to `TRENDS.md`.

## The two libraries

Both exist for the same reason: make the next run cheaper than this one.

**`.claude/qa/`** — test plans by feature area, reusable automation, fixtures, and per-run evidence. `qa-specialist` reads `INDEX.md` before writing anything and extends existing plans rather than forking near-duplicates. Plans, scripts and fixtures are committed and merge with the change they cover; screenshots and video stay local via `runs/.gitignore`.

**`.claude/ops/`** — the instrumentation and the coach's reports. The event stream lives at `~/.claude/ops/<slug>/` (outside the repo, so worktrees converge on one stream) and is never committed. Reports *are* committed, deliberately: their git history is how the coach attributes a change in outcomes to a change in an agent definition.

| Path | Committed? | Why |
| ---- | ---------- | --- |
| `.claude/agents/*.md` | Yes | The team definition |
| `.claude/ops/*.mjs`, `reports/TEMPLATE.md`, `reports/TRENDS.md` | Yes | Instrumentation and the report contract |
| `.claude/ops/reports/<date>-*.md` | Yes | The durable artifact; history enables attribution |
| `~/.claude/ops/<slug>/*.jsonl` | No (outside repo) | Noisy, machine-local, contains command lines |
| `.claude/qa/plans`, `scripts`, `fixtures` | Yes | Project assets |
| `.claude/qa/runs/**` binaries | No | Heavy; referenced by path from reports |

## Troubleshooting

**Hooks never fire.** They load at session start — restart after editing `settings.json`. Check that `node` is on PATH, and that the hook command path resolves from the *working directory* of the session (this is the fragility the plugin layout fixes).

**The event stream is split across directories.** `STREAM` disagrees between `capture.mjs` and `friction.mjs`, or you changed one and not the paths documented in `agent-coach.md`.

**`agent-coach` says it can't write a file.** Working as designed — it's propose-only, and `guard.mjs` enforces it. Its proposals are diffs inside the report; a human applies them.

**Playwright tools unavailable to `qa-specialist`.** The project MCP server needs one-time approval; restart and accept. Confirm `mcp__playwright__*` is still in the agent's `tools`.

**Jira transitions fail.** Almost always the MCP tool-name mismatch in the [adaptation table](#adapt-it-to-your-project).

**An IC's changes land in the wrong place.** `isolation: worktree` needs a git repo; in a non-repo directory the isolation silently doesn't apply.

## Two design decisions worth understanding

**The process observer is a hook, not an agent.** An agent cannot watch another agent work: subagent conversations are isolated and are never written to session transcripts (a scan of 181 local transcripts found zero sidechain records). Hooks *do* fire inside subagents and carry `agent_id` and `agent_type`. So capture is a hook — deterministic, zero-token, always on — and the analysis is an agent that reads what was captured. "Parallel observer" becomes "continuous capture, periodic analyst."

**`agent-coach` proposes and never applies.** An agent that rewrites the definitions governing agents is an unbounded feedback loop, and prompt regressions are silent: no stack trace, just worse work three sprints later. The constraint is enforced by `guard.mjs` on `PreToolUse`, not by instruction alone — the coach is blocked from writing `.claude/agents/**`, `settings*.json`, and its own instrumentation. It reads everything and argues for changes in a report a human reviews.
