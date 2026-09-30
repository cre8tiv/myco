# design-team

Takes an idea — or an existing PRD or spec — to a decided **design package**: PRD, architecture, security review, tech design, and UX where there's a user surface, ready to hand to an engineering team.

| Agent | Writes | Runs |
| ----- | ------ | ---- |
| `product-lead` | `README.md` (package index), `prd.md` | As the session agent. Owns the conversation and the decision loop. |
| `architect` | `architecture.md` | Dispatched by the lead once positioning and deployment are decided. |
| `ux-designer` | `ux.md`, prototypes under `ux/` | Dispatched when there's a user-facing surface; alongside the architect. |
| `security-reviewer` | `security-review.md` | Dispatched once the architecture exists. |
| `tech-designer` | `tech-design.md` | Dispatched once architecture and security review exist. |

Plus one skill, `/init-design`, which profiles where this project's design work lives and goes.

Depends on [`team-ops`](../team-ops), installed automatically, which captures how the team works so `agent-coach` can analyze it alongside any other team.

## Set up

Just start the product lead (below). If the project has no design profile yet, it offers to run setup first, in the same session, and carries straight on afterwards. You can also run `/init-design` yourself at any time, from any session, to refresh the profile.

Setup runs once per project. It detects where design docs already live in the repo, which systems this session can reach (tracker, Confluence, Notion, Linear, Figma), and whether your account offers Claude Design for prototypes. It asks only what it can't infer — where packages are published, who signs off, which design files to use — verifies each destination and source with a read-only call, and writes `.claude/team/design.md`. Commit that file.

Skipping it works: the product lead asks the minimum as it goes. But it asks again next time, and it won't know about your Confluence space or Figma file unless told.

When setup finishes it ends on one concrete next step — adopting the PRD you mentioned, say. Inside the product lead's session it asks whether to go ahead; from any other session it gives you the command and a first message to paste.

## Start a session

```sh
claude --agent design-team:product-lead
```

The product lead has to run as the session agent rather than being dispatched from another session, because the decision loop needs you in the conversation. It works out which of three situations it's in:

- **A new idea** — describe it.
- **An existing PRD, spec or design** — point it at the file path, link, or paste it. It fetches the whole document, records where it came from, maps it into the package without dropping anything (content that doesn't fit goes to an *Imported — unplaced* appendix for you to place), keeps existing requirement IDs and decisions, and makes the gaps — missing sections, untestable requirements, unresolved "TBD"s, unverified dependencies — your first round of questions. The original is left untouched; the package becomes the working copy and is published back at milestones.
- **A package in progress** — it reads the package, tells you where it stands, and continues from the next step.

## How it works

1. **Frame** — what the thing is, who has the problem, and its positioning. Confirmed with you before going further.
2. **Ground** — searches the tracker, wiki, design files and code for what already exists, classifying each dependency as exists-public, exists-internal, planned, or missing, with sources.
3. **Recommend** — a position with named wrinkles, plus which documents this work needs. A small change gets a smaller package.
4. **Draft** — the PRD, with IDed and phased requirements and open questions phrased as decisions.
5. **Dispatch** — each specialist as soon as the questions that would change its output are decided. Independent specialists run in parallel.
6. **Decision loop** — questions from every document, merged into one list, put to you in rounds. Every decision is logged once, in the PRD; a reversed decision is superseded, never rewritten.
7. **Check and hand off** — traceability is verified across documents, then the package is marked **Ready for engineering**.

**Only the product lead talks to you.** Specialists write their document and return questions, missing requirements and consequential decisions to the lead, which puts them to you. You get one conversation and one decision log, not five.

## The package

```
<packages_dir>/<slug>/     (docs/design/ by default)
  README.md            index, readiness checklist, published copies, engineering handoff
  prd.md               requirements, phasing, decision log
  architecture.md      components, flows, Mermaid diagrams, ADRs
  security-review.md   threat model, SEC-n controls
  tech-design.md       contracts, data, rollout, test strategy, traceability
  ux.md                flows, surfaces, states, wireframes
  ux/                  prototypes
```

The markdown in the repo is the working source of truth. If `design.md` names a destination — Confluence, Notion, Linear — the product lead publishes there at the milestones it records, and checks the published copy for edits made there before overwriting it.

**IDs trace across documents.** PRD requirements carry area-prefixed IDs (`APR-3`). Security controls are `SEC-n`, and become PRD requirements so they're phased. The tech design's traceability table maps every P0/P1 requirement and every `SEC-n` control to where it's implemented and how it's verified. The readiness checklist is checked against those tables before handoff.

## Prototypes

The ux-designer builds prototypes for surfaces where layout or interaction is the question, in the mode `design.md` records:

- **`claude-design`** — a Claude Design canvas of editable artboards, drafted with `/design` in your account's design system. Needs Claude Code v2.1.265+, a claude.ai login, and a one-time `/design consent`, which grants agents access to your Claude Design projects. The consent is tied to your claude.ai login rather than the project, so each teammate grants it once. `/init-design` checks all of this and asks you to consent if needed.
- **`html`** — self-contained HTML under `ux/`, opening straight from disk, with every state reachable. Published as a page when the Artifact tool is available.
- **`wireframes`** — text wireframes only.

`ux.md` always carries the flows, states table and text wireframes, whatever the mode — it's what engineering and QA read. When the ux-designer can't publish a prototype itself, the product lead publishes it from your session. Published prototypes are private until you share them.

`/init-design` also takes stock of the design systems and design artifacts that already exist — claude.ai design systems, earlier Claude Design canvases, the repo's tokens and component library, Figma libraries — and records the relevant ones, and which is canonical, in `design.md`. The ux-designer reads them before designing, applies the canonical tokens even to HTML prototypes, and extends existing Figma frames and components rather than approximating them.

## Handing off to engineering

With the `engineering-team` plugin installed:

```sh
claude --agent engineering-team:tech-lead
> Implement phase 1 of docs/design/<slug>/
```

The tech lead reads the package index first. Requirement IDs become tickets, `SEC-n` controls and UX state tables become acceptance criteria and QA scenarios, and design questions discovered during implementation are routed back to the package rather than quietly diverging. The two plugins share no code; the package directory is the whole contract.

## Troubleshooting

**`--agent design-team:product-lead` isn't recognized.** Confirm the plugin is installed (`/plugin`) and restart.

**The product lead can't reach Confluence, Figma or another system `design.md` names.** The MCP server isn't connected in this session, or the tool prefix in the profile is wrong. Re-run `/init-design` to re-detect and re-verify.

**An adopted PRD lost a section.** It shouldn't — check the *Imported — unplaced* appendix, where anything that didn't map lands.

**A specialist says its inputs are missing.** Expected ordering: the security reviewer needs `architecture.md`; the tech designer needs both `architecture.md` and `security-review.md`.

**A specialist edited the PRD.** It shouldn't — specialists propose PRD changes to the lead. Revert the edit and ask the lead to apply it as a proposal.

**Prototypes are HTML files but you expected Claude Design.** Most often you haven't run `/design consent` yet — it's per person, so a teammate who set the project up doesn't cover you. Run it, then re-run `/init-design`. If the Design type still doesn't appear, your plan or organization doesn't offer it; on Enterprise, an owner enables the Design template under *Organization settings → Artifacts*. `design.md` records what setup found.

## Files

```
agents/           product-lead, architect, security-reviewer, tech-designer, ux-designer
skills/
  init-design/    the setup interview
templates/
  prd-template.md
  architecture-template.md
  security-review-template.md
  tech-design-template.md
  ux-template.md
  package-index.md        becomes <packages_dir>/<slug>/README.md
  design-profile.md       becomes .claude/team/design.md
```
