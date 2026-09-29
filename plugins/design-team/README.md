# design-team

Takes an idea to a decided **design package** — PRD, architecture, security review, tech design, and UX where there's a user surface — ready to hand to an engineering team.

| Agent | Writes | Runs |
| ----- | ------ | ---- |
| `product-lead` | `README.md` (package index), `prd.md` | As the session agent. Owns the conversation and the decision loop. |
| `architect` | `architecture.md` | Dispatched by the lead once positioning and deployment are decided. |
| `ux-designer` | `ux.md` | Dispatched when there's a user-facing surface; alongside the architect. |
| `security-reviewer` | `security-review.md` | Dispatched once the architecture exists. |
| `tech-designer` | `tech-design.md` | Dispatched once architecture and security review exist. |

## Start a session

```sh
claude --agent design-team:product-lead
```

Then describe the idea. The product lead has to run as the session agent rather than being dispatched from another session, because the decision loop needs you in the conversation.

## How it works

1. **Frame** — what the thing is, who has the problem, and its positioning. Confirmed with you before going further.
2. **Ground** — searches the tracker, wiki and code for what already exists, classifying each dependency as exists-public, exists-internal, planned, or missing, with sources.
3. **Recommend** — a position with named wrinkles, plus which documents this work needs. A small change gets a smaller package.
4. **Draft** — the PRD, with IDed and phased requirements and open questions phrased as decisions.
5. **Dispatch** — each specialist as soon as the questions that would change its output are decided. Independent specialists run in parallel.
6. **Decision loop** — questions from every document, merged into one list, put to you in rounds. Every decision is logged once, in the PRD, and cascaded into every document it touches.
7. **Check and hand off** — traceability is verified across documents, then the package is marked **Ready for engineering**.

**Only the product lead talks to you.** Specialists write their document and return questions, missing requirements and consequential decisions to the lead, which puts them to you. You get one conversation and one decision log, not five.

## The package

```
docs/design/<slug>/
  README.md            index, readiness checklist, engineering handoff
  prd.md               requirements, phasing, decision log
  architecture.md      components, flows, Mermaid diagrams, ADRs
  security-review.md   threat model, SEC-n controls
  tech-design.md       contracts, data, rollout, test strategy, traceability
  ux.md                flows, surfaces, states, wireframes
```

The markdown in the repo is the source of truth. If you also publish to Confluence or elsewhere, that happens from the repo as a last step.

**IDs trace across documents.** PRD requirements carry area-prefixed IDs (`APR-3`). Security controls are `SEC-n`, and become PRD requirements so they're phased. The tech design's traceability table maps every P0/P1 requirement and every `SEC-n` control to where it's implemented and how it's verified. The readiness checklist in the package index is checked against those tables before handoff.

## Handing off to engineering

With the `engineering-team` plugin installed:

```sh
claude --agent engineering-team:tech-lead
> Implement phase 1 of docs/design/<slug>/
```

The tech lead reads the package index first. Requirement IDs become tickets, `SEC-n` controls and UX state tables become acceptance criteria and QA scenarios, and design questions discovered during implementation are routed back to the package rather than quietly diverging.

The two plugins share no code; the package directory is the whole contract. Each works without the other.

## Project profile

The first time it needs to, the product lead asks where packages should live and how they're reviewed, and records the answers in `.claude/team/design.md` alongside grounding sources, compliance context and design-system conventions. Edit that file to change them. If the engineering team's `.claude/team/project.md` exists, the design team reads it too.

## Troubleshooting

**`--agent design-team:product-lead` isn't recognized.** Confirm the plugin is installed (`/plugin`) and restart.

**A specialist says its inputs are missing.** Expected ordering: the security reviewer needs `architecture.md`; the tech designer needs both `architecture.md` and `security-review.md`. The lead dispatches in that order — if you're dispatching specialists by hand, follow it.

**A specialist edited the PRD.** It shouldn't — specialists propose PRD changes to the lead. Revert the edit and ask the lead to apply it as a proposal.

**The package says Ready but engineering found a requirement nobody designed.** It's missing from the tech design's traceability table. Add it via the lead, and re-dispatch the tech designer with the requirement ID.

## Files

```
agents/         product-lead, architect, security-reviewer, tech-designer, ux-designer
templates/
  prd-template.md
  architecture-template.md
  security-review-template.md
  tech-design-template.md
  ux-template.md
  package-index.md        becomes docs/design/<slug>/README.md
  design-profile.md       becomes .claude/team/design.md
```
