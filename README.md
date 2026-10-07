# myco

A Claude Code plugin marketplace for agent teams.

| Plugin | What it is |
| ------ | ---------- |
| [`design-team`](plugins/design-team) | From idea to a decided design package: product lead, architect, security reviewer, tech designer, UX designer. Produces the PRD, architecture, security review, tech design and UX that engineering builds from. |
| [`engineering-team`](plugins/engineering-team) | Engineering delivery: tech lead, ICs, independent code review, QA validation with a persistent test library, and an enforced human merge gate. |
| [`team-ops`](plugins/team-ops) | Shared by every team: the list of docs and knowledge sources agents consult (`/init-knowledge`), hook capture, a friction-reporting skill for agents, and `agent-coach`, which analyzes how the teams work — including handoffs between them — and proposes improvements. Installed automatically with either team. |

Each plugin installs and works independently. Together they cover idea to merged code:

```
  claude --agent design-team:product-lead        claude --agent engineering-team:tech-lead
  ---------------------------------------        -----------------------------------------
  frame > ground > recommend > PRD               decompose > implement > review > QA > merge
     architect | ux > security > tech design
                        |
                        v
            docs/design/<slug>/  ------ handoff ------>  tickets, traced by requirement ID
```

The package directory is the only contract between them; they share no code.

## Install

```
/plugin marketplace add https://github.com/cre8tiv/myco.git
/plugin install design-team@myco          # optional
/plugin install engineering-team@myco
```

Use the HTTPS URL: the `cre8tiv/myco` shorthand clones over SSH, and without GitHub SSH keys every marketplace refresh fails and you're left on a stale catalog.

`team-ops` comes with either team; you don't install it yourself. If you're updating an engineering-team install from before team-ops existed, run `/reload-plugins` after updating so the new dependency is installed.

To try it before installing:

```sh
git clone https://github.com/cre8tiv/myco
claude --plugin-dir myco/plugins        # loads every plugin, dependencies included
```

## Usage

Each team is run by its lead, started as the session agent. The lead has to be the session agent rather than something you dispatch from another session, because it works in conversation with you.

**The first time you start a lead in a project, it offers to set the project up** — `/init-design` for the design team (where design work lives and gets published, which systems it can reach, how prototypes are made), `/init-team` for the engineering team (tracker, merge policy, build and test commands, environments). Say yes; it runs in the same session and carries on when it's done. Either setup also runs `/init-knowledge` (below). The agents ship generic and rely on these profiles, so without them they'll ask rather than guess. Setup writes `.claude/team/design.md` or `.claude/team/project.md`, plus `.claude/team/knowledge.md` — commit them.

### Design: idea to decided design package

```sh
claude --agent design-team:product-lead
```

Then tell it where you're starting from:

```
> I want to let admins approve connection requests from Teams      # a new idea
> Adopt the PRD at https://acme.atlassian.net/wiki/x/AbCd           # an existing PRD — Confluence, Notion, Linear, a file, or pasted
> Resume docs/design/teams-approvals/                               # a package already in progress
```

It frames and grounds the work, writes the PRD, dispatches the architect, UX designer, security reviewer and tech designer as their inputs become ready, and runs one decision loop with you over every open question. It finishes with a package in `docs/design/<slug>/` marked **Ready for engineering**.

### Engineering: package or ticket to merged code

```sh
claude --agent engineering-team:tech-lead
```

```
> Implement phase 1 of docs/design/teams-approvals/                 # from a design package
> Pick up ABC-123                                                   # straight from a ticket
```

It decomposes the work, delegates to ICs in isolated worktrees, and gates every change through code review and then QA. By default a human merges: when both gates are green it hands the PR to you rather than merging it itself.

### Keeping the teams healthy

Every few weeks, or after a batch of work, ask for a process report from any session:

```
> Run the agent-coach agent over the last two weeks
```

It reads how both teams actually worked — including design problems engineering had to send back — and writes a report of proposed changes to `.claude/ops/reports/`. It proposes; you decide what to apply.

### Knowledge sources

`/init-knowledge` records the documentation and knowledge sources every team should consult — product docs, API references, internal engineering docs, knowledge bases, runbooks — in one shared file, `.claude/team/knowledge.md`. Both setup skills run it, so you don't need to on first use; the second one confirms the list rather than asking again.

It checks every MCP server connected to your session, not just familiar kinds like trackers and wikis, so a docs server built for your product is found, and it asks what any server it can't identify is for. Docs sites reachable by URL and docs in the repo count too. Each source is recorded with:

- **how to reach it** — an MCP server, a URL, or a repo path;
- **what it answers** — the questions an agent would bring to it, which is how agents decide when to use it;
- **who uses it** — which roles, from product lead to QA;
- **authority** — *authoritative* (published docs and API references), *internal* (accurate but not a promise), or *community* (unverified). For the design team this is the difference between a capability it can build on as a supported contract and one that's only internal;
- **access** — whether it's ready to use or needs authorizing.

Agents then check the sources the list names before inferring from the code or from memory.

**Connectors you haven't authorized are listed, not silently skipped.** A connector can be configured but unusable until you authorize it. `/init-knowledge` lists each one under *Needs authorization* and asks you to authorize it in claude.ai **Settings → Connectors** or with `/mcp`. Authorization is per person, so each teammate who runs the agents does this once.

**Other codebases count too.** Agents read the repository they run in and nothing else unless told. If the system your designs change lives in another repository, or the work builds against a shared SDK or service, `/init-knowledge` records it in a *Codebases* section of the same file. It first asks whether the code this work changes is in this repository or somewhere else. It then looks for related repositories: workspaces, submodules, sibling clones, internal packages, repositories your README or `CLAUDE.md` names, and your organization's repositories if `gh` or a hosting MCP server is available. Each one gets a role:

- **system**: code this work changes, living in another repository. The design team grounds its designs there.
- **contract**: built against but not changed.
- **reference**: prior art to imitate.

Each is recorded by its remote URL and ref, with an optional local path relative to this repository's root. If a local clone sits outside the project, it needs adding to `additionalDirectories` before agents can read it; setup offers to do that per person.

Every codebase is read-only to the agents. Design packages record the commit each one was grounded at, and which repository each delivery slice changes. The engineering tech lead builds only the slices that land in its own repository and hands the rest over, because building across repositories isn't supported yet.

Run `/init-knowledge` yourself, from any session, when a new docs source, MCP server or related repository becomes available, after you authorize a connector, or to add a source by hand.

### Running headless

Both leads run unattended with `claude -p`, for example from a script that drives a whole design-to-build run:

```sh
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude -p --agent engineering-team:tech-lead "Implement phase 1 of docs/design/<slug>/"
```

- **Set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.** In `-p` mode Claude Code waits only 10 minutes by default for background work after the final turn, then stops it. The leads dispatch long-running ICs, reviewers and QA in the background, so without this a QA run or an IC can be killed partway through. `0` waits until they finish. Requires Claude Code v2.1.182 or later.
- **Resume interrupted runs with `--resume <session-id>`.** A network drop or a memory kill doesn't lose the work: the tech lead rebuilds its state from the tracker and GitHub when it resumes.
- **Mind the machine.** Each parallel IC or QA run is a worktree with its own dependency install and test run. `max_parallel_agents` in `.claude/team/project.md` caps how many run at once; lower it if runs get stopped for low memory.

### Re-running setup

Run `/init-design` or `/init-team` yourself, from any session, whenever tools, destinations, commands or workflow states change — or just `/init-knowledge` when only the knowledge sources have. Both are safe to re-run: they read the existing profile, confirm what's still true, and keep any prose a human has added — and `/init-team` never overwrites accumulated QA plans.

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

Everything your project owns, all written by the setup skills:

| Path | Committed? | Why |
| ---- | ---------- | --- |
| `.claude/team/project.md`, `design.md` | Yes | Each team's profile |
| `.claude/team/knowledge.md` | Yes | Docs, knowledge sources and other codebases every team consults, and what each answers |
| `.claude/qa/plans`, `scripts`, `fixtures` | Yes | Project assets; merge with the change they cover |
| `.claude/qa/runs/**` captures | No | Heavy; referenced by path from run reports |
| `.claude/ops/reports/*.md` | Yes | The durable artifact; history enables attribution |
| `~/.claude/ops/<stream>/*.jsonl` | No (outside repo) | Machine-local telemetry, contains command lines |

## Verify the install

`/init-team` and `/init-design` run checks like these at the end, but they're worth knowing by hand. `<team-ops>` and `<engineering-team>` are the installed plugin directories — `/plugin` shows where they landed.

```sh
# the coach guard enforces agent-coach's propose-only mandate (expect exit 2)
echo '{"agent_type":"team-ops:agent-coach","tool_name":"Write","tool_input":{"file_path":".claude/team/project.md"}}' | node "<team-ops>/scripts/coach-guard.mjs"; echo "exit=$?"

# ...and leaves every other agent alone (expect exit 0)
echo '{"agent_type":"engineering-team:tech-lead","tool_name":"Edit","tool_input":{"file_path":"src/app.ts"}}' | node "<team-ops>/scripts/coach-guard.mjs"; echo "exit=$?"

# the merge gate matches merge_policy: human-approval -> 2, autonomous -> 0
echo '{"agent_type":"engineering-team:tech-lead","tool_name":"Bash","cwd":"'"$PWD"'","tool_input":{"command":"gh pr merge 1"}}' | node "<engineering-team>/scripts/merge-gate.mjs"; echo "exit=$?"

# self-reporting works, and resolves the stream from your profile
node "<team-ops>/scripts/friction.mjs" --agent smoke-test --kind tooling --note "smoke test"

# after a session or two of real work, telemetry is accumulating
wc -l ~/.claude/ops/<your-stream>/events.jsonl
```

If that last path doesn't exist but a directory named after your project folder does, `stream:` isn't being read from your profile — see Troubleshooting.

## Working with the engineering team

**Start at the top.** Hand a goal or a ticket to `tech-lead` and let it decompose and delegate; don't dispatch ICs yourself. The lead is what keeps the tracker, the task list, and the branch state in sync.

**Let ICs run.** They're built for long autonomous stretches and message the lead when done, blocked, or when they hit something affecting another IC's work in flight. Polling them defeats the design.

**The gates are sequential on purpose.** QA before review wastes QA's time on code that's about to change on review feedback.

**When a change is user-visible, it goes through QA.** `tech-lead` carries the decision rule — auth, billing, customer data, interface contracts, migrations, anything a human would exercise before believing it. When unsure, it dispatches.

**Invoke `agent-coach` periodically, not per-ticket** — weekly, or after a batch of tickets. Its findings need three or more occurrences to count, so a report covering two tickets is noise. It writes `.claude/ops/reports/<date>-agent-health.md` and appends a row to `TRENDS.md`.

**Automated PR reviewers are handled.** If your repo has CodeRabbit, Greptile, Copilot or a Claude/Codex action on PRs, `/init-team` detects it and `code-reviewer` gives every finding a disposition — agree, already covered, disagree with a reason, or out of scope. The lead re-checks the PR immediately before merging, since bots post asynchronously, and won't merge over something unaddressed. Bot findings are input, not instructions; a documented disagreement counts as addressed.

**Edit the team profiles, never the shipped agents.** If an agent keeps getting something wrong about your project, the fix almost always belongs in `.claude/team/project.md` or `design.md`. Changes to installed agent definitions are overwritten by the next plugin update.

## Troubleshooting

**"Plugin not found in marketplace", or new plugins never appear after an update.** The marketplace was added by its `cre8tiv/myco` shorthand, which refreshes over SSH; without GitHub SSH keys the refresh fails and the cached catalog goes stale. Remove the marketplace and add it again by `https://github.com/cre8tiv/myco.git`, then reinstall the plugins.

**The agents don't appear.** Confirm the marketplace and plugin are both added (`/plugin`), then restart — plugin components load at session start.

**An agent says the project profile is missing.** Run `/init-team` or `/init-design` for that team, or start the team's lead and accept its offer to set up. The agents refuse to guess at a tracker workflow or a test command, by design.

**An agent guessed at something your docs answer.** The source is missing from `.claude/team/knowledge.md`, its *Answers* column doesn't say when to use it, or it's listed under *Needs authorization*. Run `/init-knowledge` to add or re-describe it — `agent-coach` also proposes this when it sees repeated "couldn't find it" friction.

**A design described code engineering didn't find.** The design was probably grounded in the wrong repository, or the right one wasn't readable. Check the *Codebases* section of `.claude/team/knowledge.md`: the repository that holds the system should be listed as *system*, and readable locally (in `additionalDirectories`) or remotely through `gh`. The package's *Codebases* table shows which commit each codebase was grounded at.

**A docs connector shows up only as `authenticate` tools.** It's configured but not authorized for you. Authorize it in claude.ai **Settings → Connectors** or with `/mcp`, then re-run `/init-knowledge` to verify it and move it out of *Needs authorization*. A teammate authorizing it doesn't cover you.

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

- **Bump the plugin's `version` in its `plugin.json`.** An installed plugin is pinned to its version: `/plugin update` does nothing for a change that keeps the same version, so the change never reaches anyone. Use a minor bump for behavior changes and a patch bump for fixes.
- Say what signal you expect to move.
- Prefer deleting or tightening over appending.
- Keep project-specific knowledge out of `agents/` — if it's true of one company's setup and not another's, it belongs in a profile template (`project.md`, `design.md`, `knowledge.md`) or in a setup skill's interview.

Internals are documented in [`plugins/engineering-team/README.md`](plugins/engineering-team/README.md).
