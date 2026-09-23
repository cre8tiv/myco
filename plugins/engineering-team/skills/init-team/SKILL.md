---
name: init-team
description: Set up the engineering-team agents for this project. Detects the project's stack, test commands, tracker and environments; asks only what it cannot infer; then writes .claude/team/project.md and scaffolds the QA and ops directories. Use after installing the engineering-team plugin, when the agents report that .claude/team/project.md is missing, or when the project's commands, tracker or environments have changed and the profile needs refreshing.
---

# init-team

The agents in this plugin ship deliberately generic. Everything project-specific — tracker and field names, workflow states, build and test commands, environments, how QA exercises the software — lives in one generated file, `.claude/team/project.md`. Your job is to produce that file, scaffold the directories the agents expect, and verify the install.

**Detect before you ask.** The worst version of this skill is a twenty-question interrogation about things sitting in the repo. Read first, ask only about what you genuinely cannot infer, and show the user what you found so they can correct it.

## 1. Detect

Work out as much as possible from the repo, and note your confidence in each:

- **Project type and stack** — `package.json`, `pyproject.toml`, `pom.xml`, `*.csproj`, `go.mod`, `Cargo.toml`, `Gemfile`, `build.gradle`, `*.sln`, Dockerfiles, `Makefile`. Is there a web surface (a dev-server script, a framework dependency, an `index.html`)? An API (route definitions, an OpenAPI spec)? A CLI (a `bin` entry)? A library (an exported package with no entry point)? Migrations (a `migrations/` directory)? A mobile target (`android/`, `ios/`, a `.xcodeproj`)?
- **Verification commands** — the `scripts` block, `Makefile` targets, or the CI workflow files under `.github/workflows` or `azure-pipelines.yml`. **CI config is the most reliable source**: it names the commands that actually have to pass. Prefer the project's own script wrapper over a bare tool invocation, so config and transforms are picked up.
- **Trunk branch and remote** — `git symbolic-ref refs/remotes/origin/HEAD`, `git remote -v`. The remote host tells you the likely tracker and PR tool.
- **Branch convention** — `git log --format=%D` or recent branch names; infer the ticket-key pattern if there is one.
- **Existing tracker tooling** — which MCP servers are actually available in this session. **Use the real tool prefix you can see** (e.g. `mcp__atlassian__*`), never a guessed one; a wrong prefix is the single most common cause of an agent silently lacking a tool.
- **Automated PR reviewers** — the highest-value detection here, because the team currently has no way to know about them. Check both:
  - *Config in the repo:* `.coderabbit.yaml`, a Greptile config, `.github/copilot-instructions.md`, and any workflow under `.github/workflows/` or `azure-pipelines.yml` that invokes a review action (CodeRabbit, Greptile, Codex, `claude-code-action`, Copilot review).
  - *Recent PRs, which is the stronger signal* — a bot installed as a GitHub App leaves no trace in the repo. List a few recently merged PRs and look at who reviewed or commented; authors whose login ends in `[bot]` or which are marked as apps are your answer. Note roughly how long after PR open each one posted, and whether its approval appears as a required check.
- **Existing conventions** — a `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md` already in the repo. Harvest it rather than re-asking the user; contradicting an existing CLAUDE.md is worse than being silent.
- **Prior profile** — if `.claude/team/project.md` already exists, read it and treat this as a refresh: confirm what's still true, update what isn't, and don't discard the prose sections a human has written.

## 2. Discover tracker fields rather than asking for IDs

If the project uses a tracker with an MCP server available, look the fields up instead of asking the user to know internal field IDs. For Jira, fetch the create/edit field metadata for the project's issue types and find the fields whose names correspond to acceptance criteria and to validation or QA instructions; record both the human name and the `customfield_NNNNN` ID, because agents need the ID and humans need the name. Note any field the create API demands and the format it wants — that detail is exactly what costs someone an afternoon later.

If no tracker MCP is available, don't fake it. Record `ticket_system: none` and note that agents should skip ticket transitions and report to the lead only.

## 3. Ask only the gaps

Use `AskUserQuestion` for what you couldn't infer, batching related questions. Realistic gaps:

- **How QA should exercise this software**, if the project type is ambiguous or mixed. This is the highest-value question in the whole interview: it determines whether QA drives a browser, probes an API, runs a CLI, writes a consumer harness, or runs migrations against a realistic dataset. Get it wrong and every QA run is theater.
- **Ephemeral/preview environments** — do they exist, how is one created, how is one reset? If the project has a skill or script for this, name it.
- **Workflow state names**, if the tracker exposes several and the mapping isn't obvious.
- **The stream slug** — propose the repo name; it only needs confirming.
- **Prerequisites to run locally** that aren't in the repo: required services, env vars, seed data, credentials. Ask what's needed, never for the secret values themselves.

### Always ask about the merge policy

This one is never inferred. Ask it every time, including on a refresh, and present it plainly — the user is deciding how much autonomy to hand over:

- **`human-approval`** (recommend this, and it's the default if they don't decide) — the team implements, reviews, validates and prepares the merge, then stops and notifies a human, who merges. A hook enforces it: agents are blocked from completing a merge.
- **`autonomous`** — the team merges to the trunk itself once both gates are green. Say out loud what this means: a ticket can go from assignment to merged trunk with no human in the loop at any point.

If they choose `human-approval`, you need two more things:

- **Who approves** — the handle to request PR review from.
- **How to notify them.** Check what's actually available in this session before offering options. A chat MCP (Slack, Teams) if one is present; otherwise a PR review request, which always works and lands in their normal workflow; otherwise reporting in session only. Record the exact tool and channel, not "notify the user" — an agent can't act on that. Prefer *both* a review request and a chat ping when a chat tool exists: the request is durable, the ping is timely.

If they choose `autonomous`, still agree an **escalation list** — the change types that warrant a human even so (auth, permissions, billing, customer data, migrations, public contracts, infrastructure). Start from that list and let them edit it.

### Ask about automated reviewers only to confirm

Show what you detected and confirm it, rather than asking from scratch. What you can't detect and should ask: how a comment is marked addressed on this repo (reply, resolve the thread, a keyword the tool recognizes), and whether any of them reliably produce **known noise** on this codebase — findings that are always wrong here. That last answer saves the reviewer re-litigating the same false positive on every PR, so it's worth asking even though it feels like an odd question.

When the user corrects a detection, take the correction and don't re-litigate it.

## 4. Write the profile

Copy `${CLAUDE_PLUGIN_ROOT}/templates/team/project.md` to `.claude/team/project.md` and fill it in. Rules:

- **Every placeholder gets replaced or removed.** A profile shipped with `<command>` still in it is worse than no profile — an agent will read it as literal.
- **Commands must be the real, runnable ones.** Verify each by running it if it's safe and fast (`lint`, `typecheck`, `--version`); don't run a full suite or anything destructive just to check. Say in your summary which ones you actually verified and which you took on trust.
- **Fill the friction command with the absolute path** to `${CLAUDE_PLUGIN_ROOT}/scripts/friction.mjs`, resolved — agents can't expand the variable themselves.
- **Keep the frontmatter keys exactly as templated.** Three are read by hooks, not just by agents:
  - `stream` — which event stream this project writes to. Missing or renamed, telemetry silently goes to a directory named after the working directory.
  - `merge_policy` — **enforced.** Anything other than `autonomous` blocks agents from completing a merge. Missing means gated, which is the safe failure.
  - `trunk_branch` — which branch the merge gate protects. Keep it in sync with the prose section; a wrong value means the gate protects the wrong branch.
- **The profile must be committed.** Agents read it from inside git worktrees by walking up from the working directory, so an uncommitted profile means each IC worktree falls back to defaults — splitting the event stream and, worse, leaving the merge gate reading a different policy than you set. Tell the user to commit it.
- **Prefer honest gaps over invention.** "No preview environments" is useful. A plausible-looking fabricated command is a trap.

## 5. Scaffold the directories

```sh
mkdir -p .claude/qa .claude/ops/reports
cp -r "${CLAUDE_PLUGIN_ROOT}/templates/qa/."          .claude/qa/
cp -r "${CLAUDE_PLUGIN_ROOT}/templates/ops/reports/." .claude/ops/reports/
```

Don't overwrite an existing `.claude/qa/INDEX.md` or any accumulated plans, scripts or reports — those are the project's own assets. On a refresh, add only what's missing.

Then make sure the project's `.gitignore` keeps the heavy and machine-local things out while keeping the assets in:

- `.claude/qa/runs/**` binary captures (the templated `runs/.gitignore` already handles this)
- nothing else needs ignoring — the event stream lives outside the repo, under `~/.claude/ops/<stream>/`

## 6. Browser automation, only if it applies

If and only if the project has a web surface, add a Playwright MCP server to the project's `.mcp.json` — **merging** into an existing file rather than replacing it:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--headless",
        "--ignore-https-errors",
        "--viewport-size", "1280x800",
        "--output-dir", ".claude/qa/runs/_artifacts"
      ]
    }
  }
}
```

Headless so long unattended runs don't steal focus; certificate errors ignored so self-signed dev certs don't block a run; output directed into the QA library so captures land where a run report can cite them. Mention that it needs one-time approval on first use, and that `@latest` is worth pinning if reproducible QA results across weeks matter.

For a project with no web surface, skip this entirely — don't make a SQL or CLI project launch a browser server every session.

## 7. Verify and hand off

```sh
# the guard enforces agent-coach's propose-only mandate (expect exit 2)
echo '{"agent_type":"agent-coach","tool_name":"Write","tool_input":{"file_path":".claude/team/project.md"}}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs"; echo "exit=$?"

# ...and leaves everyone else alone (expect exit 0)
echo '{"agent_type":"tech-lead","tool_name":"Edit","tool_input":{"file_path":"src/app.ts"}}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs"; echo "exit=$?"

# self-reporting works and resolves the stream from the profile you just wrote
node "${CLAUDE_PLUGIN_ROOT}/scripts/friction.mjs" --agent init-team --kind tooling --note "init-team smoke test"
tail -1 ~/.claude/ops/<stream>/friction.jsonl

# the merge gate matches the policy you just recorded
#   human-approval -> exit 2   |   autonomous -> exit 0
echo '{"agent_type":"tech-lead","tool_name":"Bash","cwd":"'"$PWD"'","tool_input":{"command":"gh pr merge 1"}}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs"; echo "exit=$?"

# ...and an IC keeping its branch current is never blocked (expect exit 0)
echo '{"agent_type":"ic-generalist","tool_name":"Bash","cwd":"'"$PWD"'","tool_input":{"command":"git merge origin/main"}}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs"; echo "exit=$?"
```

Run the merge-gate check and **say the result out loud to the user** — it's the one place where a typo in the profile silently changes how much autonomy the team has.

If the last command writes to a directory that isn't your configured stream name, `stream:` in the profile isn't being read — check the frontmatter.

Then tell the user, briefly:

1. **What you detected and what you asked** — so they can spot a wrong inference.
2. **Which commands you verified by running** vs. took on trust.
3. **What to commit**: `.claude/team/project.md`, the `.claude/qa/` scaffold, `.claude/ops/reports/` templates, and `.mcp.json` if you touched it.
4. **What's next**: hand a goal or ticket to `tech-lead`; invoke `agent-coach` after a week or a batch of tickets, not today — it needs traffic before its three-occurrence threshold means anything.
5. **The merge policy in plain words** — "agents will/won't merge without you, and here's how you'll be told" — plus the verified gate result.
6. **Anything you deliberately left blank** and what would fill it in.

Don't dump the generated file into the chat — say where it is and what's in it.
