# QA Library

Owned by the `qa-specialist` agent. The point is compounding: each validation run
should leave behind something that makes the next one cheaper.

## Layout

- `INDEX.md` — the catalog. Entry point for every run; kept current, not append-only.
- `plans/` — test plans in Gherkin, named by **feature area** (`connection-editor.md`),
  not by ticket, so coverage accumulates in one place instead of fragmenting.
- `scripts/` — reusable automation: browser specs, HTTP probes, CLI checks, helpers.
  Parameterize rather than fork; a second selector for the same form is a smell.
- `fixtures/` — seed data, saved auth state, sample payloads.
- `runs/<YYYY-MM-DD>-<TICKET>/` — per-run evidence: `report.md` plus screenshots,
  logs and traces.

## What is and isn't committed

`plans/`, `scripts/`, `fixtures/` and each run's `report.md` are committed — they are
project assets and should merge alongside the change they cover. Screenshots, videos
and traces stay on disk under `runs/` and are referenced by path from the report.

## Browser automation

`qa-specialist` has the Playwright MCP server (`mcp__playwright__*`), configured in
the project's `.mcp.json`: headless, 1280x800, certificate errors ignored, with
auto-named screenshots written to `runs/_artifacts/`. First use in a session prompts
for approval of the project-scoped server.

Live MCP driving is for exploration and one-off visual confirmation. Flows that pass
get codified as committed specs in `scripts/`; `data-testid` is the configured test-id
attribute, so prefer test ids over CSS paths. `runs/.gitignore` keeps images, video
and archives out of commits — reports reference them by path.

## Plan template

```markdown
# <Feature area>

Covers: <what this plan is responsible for>
Environments: <local :44302 / BSE / staging>
Setup: <fixtures, seeding, auth prerequisites>

## Scenario: <name>          [automated: scripts/<file> | manual]
  Given <precondition>
  When <action>
  Then <observable outcome>

## Regression watch list
- <what this area has broken before, and the scenario that catches it>

## Notes
- <anything that cost time: unstable selectors, reseed requirements, timing>
```
