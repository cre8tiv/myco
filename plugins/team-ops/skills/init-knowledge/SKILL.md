---
name: init-knowledge
description: Record the documentation and knowledge sources every agent team in this project should consult — product docs, API references, internal engineering docs, knowledge graphs, runbooks — whether reached by MCP server, URL or repo path, with what each answers, which roles use it, how authoritative it is, and whether it needs authorizing. Detects every connected MCP server (including connectors that exist but aren't authorized), asks what each unrecognized one is for, and writes .claude/team/knowledge.md. Run by /init-design and /init-team as part of setup; run it directly to refresh the list when sources change.
---

# init-knowledge

Both teams start their work by grounding: the design team before it recommends anything, the engineering team before it decides how to build. Grounding is only as good as the sources the agents know about, and a connected documentation server nobody told them about might as well not exist. Your job is to find every source worth consulting, record what each one is *for*, and write `.claude/team/knowledge.md` so every agent in every team can use it.

If `.claude/team/knowledge.md` already exists — the other team's setup may have written it — this is a refresh: confirm what's there, verify it still works, add what's new, and keep anything a human wrote.

## 1. Detect

- **Every MCP server in this session.** Load the deferred tool list with `ToolSearch` and group the tools by server (the `mcp__<server>__` prefix). Don't stop at the servers you recognize by type: a server named after the product, a team, or an internal system is often the most valuable source in the project, and it's exactly the one a fixed checklist misses. For each server, read its tool names and descriptions to work out what it serves.
- **Connectors that exist but aren't authorized.** A server whose only tools are `authenticate` and `complete_authentication` (or similar) is configured but not authorized for this person. It's invisible to every agent until someone notices. Flag each one.
- **Knowledge reached another way.** Session context that names a knowledge tool or CLI (a session-start note describing an internal knowledge base, say); documentation URLs in the repo's `README`, `CLAUDE.md`, `AGENTS.md` or `CONTRIBUTING.md`; docs directories in the repo; an `llms.txt` on a docs site. A docs site with no MCP server is still reachable by URL.
- **What's already recorded.** Trackers, wikis and design tools named in `.claude/team/project.md` or `design.md` are configured there for their operational role. List them here too only if agents should also *consult* them for answers — a wiki usually should.

Leave out servers that do things rather than answer things — browser automation, chat, calendars — unless the user says otherwise.

## 2. Ask

Use `AskUserQuestion`, batched, with what you detected as the recommended answers. For each source:

- **What it answers.** One line, in terms of the questions an agent would bring to it: "what the product publicly supports", "how this service's internals work", "known issues customers hit". For a source you couldn't identify from its tools, ask outright.
- **Who uses it.** Which roles should consult it. Product docs usually serve the product lead, architect and QA; internal engineering docs serve the tech designer, ICs and reviewers; security policy serves the security reviewer.
- **Authority.** *Authoritative* (the published, supported contract), *internal* (accurate but not a promise), or *community* (unverified). This matters more than it looks: for the design team, a capability documented in an authoritative source is *exists-public*; one found only in an internal source is *exists-internal*, and the PRD can't build on it as if it were supported.

Then ask one open question: **is anything missing?** A docs site, a knowledge base, a runbook collection, a support FAQ — anything a new engineer on this product would be told to read. Record what they name even if it isn't reachable yet.

### Unauthorized connectors

For each connector that exists but isn't authorized, tell the user plainly and ask them to authorize it:

> `<server>` is configured but not authorized, so no agent can use it. If it's worth using, authorize it in claude.ai **Settings → Connectors** (or via `/mcp`), then tell me and I'll check it works. Authorization is per person, so each teammate who runs the agents does this once.

You can't authorize on their behalf. Re-check once they confirm. Whatever they decide, record the connector — under **Needs authorization** if they skip it, so the gap stays visible.

## 3. Write

Copy `${CLAUDE_PLUGIN_ROOT}/templates/knowledge.md` to `.claude/team/knowledge.md` and fill it in, or update the existing file.

- **One row per source**, with exactly how to reach it: an MCP tool prefix, a URL, or a repo path.
- **"Answers" is the column that matters.** An agent decides whether to consult a source by matching its question against this column. "Docs" tells it nothing; "what the product publicly supports: connectors, query features, limits" tells it when.
- **Replace or remove every placeholder.** An agent will read a leftover `<...>` as literal.
- **Record honest gaps** under *Not available* rather than leaving them out.

## 4. Verify

For each source, make one cheap read-only call — a search for the product's own name, a top-level page, a list of spaces — and report which you verified, which you took on trust, and which still need authorization. Never write to a source to test it.

## 5. Report

In two or three lines: how many sources you recorded, which need authorizing and by whom, and what's missing. If you were invoked by `/init-design` or `/init-team`, return to that skill's next step rather than ending the conversation. Remind the user to commit `.claude/team/knowledge.md`.
