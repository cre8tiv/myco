---
name: init-design
description: Set up the design-team agents for this project. Detects where design documents already live, which systems are reachable for grounding and context (tracker, wiki, Figma, Notion, Linear), where packages should be published (repo only, Confluence, Notion, Linear), and whether Claude Design is available for prototypes; asks only what it cannot infer; then writes .claude/team/design.md. Use after installing the design-team plugin, when the product-lead reports the profile is missing, or when destinations, sources or the design system have changed.
---

# init-design

The design-team agents ship generic. Everything specific to this project — where packages live and get published, where to look for context, how prototypes are made, what compliance applies — lives in one file, `.claude/team/design.md`. Your job is to produce it and verify that what it names actually works.

**Detect before you ask.** Read the repo and probe the tools available in this session first; ask only about what you can't determine; show the user what you found so they can correct it.

Run this in the user's main session, not as a subagent: some of what you detect — notably Claude Design — is only visible there.

## 1. Detect

- **Prior profile.** If `.claude/team/design.md` exists, this is a refresh: confirm what's still true, update what isn't, and keep any prose a human has written.
- **The engineering profile.** If `.claude/team/project.md` exists, reuse its `stream` value and what it says about the product and tracker rather than asking again. Both teams must write telemetry to the same stream.
- **Existing design documents in the repo.** Look for directories like `docs/`, `docs/design/`, `design/`, `rfcs/`, `adr/`, `specs/`, `prd/`, and files whose names suggest PRDs, specs, RFCs or ADRs. Where the team already keeps design docs is the best default for `packages_dir`; the format of their existing ADRs is the one to keep.
- **Reachable systems.** Check which MCP tools this session actually has — load deferred tools with `ToolSearch` to see their real names. Look for trackers (Jira, Linear, GitHub, Azure DevOps), wikis (Confluence, Notion), design sources (Figma), document stores (Google Drive, SharePoint), and chat (Slack, Teams). Record the **real tool prefix** you see; a guessed prefix is how an agent ends up silently without a tool.
- **Claude Design.** If you have the `Artifact` tool, run a quickstart with intent `design`. It tells you whether this account has a Design type and which design systems it offers. That decides whether `ux_prototypes` can be `claude-design`. If you don't have the tool, don't guess — record `html`.
- **A design system in the repo.** Tokens or theme files, a component library package, Storybook, a Tailwind config. Engineering builds with this, so it's the design system of record unless the user says otherwise.

## 2. Ask only the gaps

Use `AskUserQuestion`, batching related questions, and offer what you detected as the recommended option. Realistic gaps:

- **Where packages live** — confirm the detected directory, or propose `docs/design/`.
- **Where packages are published, if anywhere.** Offer only destinations whose tools you found. For a destination, get the exact location — look up real spaces, parent pages, databases or projects with its tools and offer those, rather than asking the user to type an ID. Ask what gets published, and when.
- **How packages are reviewed and who signs off.**
- **Where existing PRDs and specs usually come from**, so adopting one later starts with a fetch rather than a search.
- **Which design files to use** if Figma or another design source is reachable — which file or team holds this product's designs.
- **Prototype mode**, when there's a real choice: `claude-design` if the account has a Design type, `html` otherwise, `wireframes` if the team wants no prototypes.
- **Compliance context** — frameworks, the data classification scheme, and anyone who must be consulted on security changes.

Don't ask about anything the user can't act on, and take a correction without re-litigating it.

## 3. Write the profile

Copy `${CLAUDE_PLUGIN_ROOT}/templates/design-profile.md` to `.claude/team/design.md` and fill it in.

- **Replace or remove every placeholder.** An agent will read a leftover `<...>` as literal.
- **Keep the frontmatter keys exactly as templated.** `stream` is read by the team-ops telemetry hooks — if both profiles exist it must match `project.md`, or the teams' activity splits across two streams and cross-team handoffs become invisible. `packages_dir`, `publish_to` and `ux_prototypes` are read by the agents.
- **Name tools and locations exactly.** "Publish to Confluence" is not actionable; a space key, a parent page and a tool prefix are.
- **Prefer honest gaps over invention.** "No design system" is useful. A plausible-looking Figma URL nobody verified is a trap.
- **The profile must be committed.** Tell the user.

## 4. Verify

Check each thing the profile names, with a cheap read-only call, and report which you verified and which you took on trust:

- `packages_dir` exists or can be created.
- Each publishing destination is reachable: read the named space, parent page, database or project.
- Each grounding and context source answers a read: a tracker search, a wiki page, a Figma file's metadata.
- If `ux_prototypes` is `claude-design`, the Design type was present in the quickstart you ran.
- Telemetry resolves to the configured stream: invoke the `team-ops:log-friction` skill once with kind `tooling` and the note "init-design smoke test", and check the entry landed in `~/.claude/ops/<stream>/friction.jsonl`. If it landed in a directory named after the working directory, `stream:` isn't being read — check the frontmatter.

Never write to a destination to test it. A test page in someone's Confluence space is a mess you've made in their system.

## 5. Hand off

Summarize briefly:

1. **What you detected and what you asked**, so they can spot a wrong inference.
2. **What you verified** vs. took on trust.
3. **What to commit:** `.claude/team/design.md`.
4. **Anything you deliberately left blank** and what would fill it in.

Don't paste the generated file into the chat; say where it is.

Then end with **one concrete next step**, not a menu. Pick it from what you learned: if the user named an existing PRD or spec during setup, the next step is adopting it; if there's a package already in progress, resuming it; otherwise, describing the idea. Name the actual document, link or package.

How you phrase that step depends on where you're running — check before you write it:

- **You are the product lead** — this session was started as `design-team:product-lead`, so your own instructions describe that role. Don't tell the user to start a session; they're in it. Ask whether to go ahead — *"Setup's done. Shall I adopt the PRD at <link> now?"* — and on a yes, continue straight into the product lead's step 0 in this conversation.
- **You're in any other session** — the product lead has to be the session agent for its decision loop, so the user needs a new session. Give them the exact command and a first message they can paste, and say why it's a new session:

  ```
  claude --agent design-team:product-lead
  > Adopt the PRD at <link>
  ```

Either way, describe the next step as what will actually happen. Adopting a PRD starts with a gap check even when the document looks fully decided, so don't promise the user it will skip straight to the specialists.
