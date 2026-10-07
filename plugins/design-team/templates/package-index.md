# Package index template

This becomes `docs/design/<slug>/README.md`: the first file anyone opens, and the contract the engineering tech lead reads before decomposing the work. Keep it current as documents change. Replace guidance with content.

---

```markdown
# <Initiative name>

| | |
| --- | --- |
| **Status** | <Framing | Drafting | In decision loop | Ready for engineering> |
| **Owner** | <name> |
| **Last updated** | <date> |
| **Adopted from** | <source link, its version or date, and when it was fetched — or "new"> |

<One paragraph: what this is and why, from the PRD's problem and positioning.>
```

## Documents

Table with columns `Document | Author | Status | Open questions`. List only the documents agreed for this package; for any standard document left out, add a row saying why (for example "UX — N/A, no user-facing surface").

| Document | Author | Status | Open questions |
| --- | --- | --- | --- |
| [PRD](prd.md) | product-lead | | |
| [Architecture](architecture.md) | architect | | |
| [Security review](security-review.md) | security-reviewer | | |
| [Tech design](tech-design.md) | tech-designer | | |
| [UX](ux.md) | ux-designer | | |

**Prototypes:** one line per prototype — surface, link or `ux/` path, and whether it has been published.

**Published copies:** one line per destination — where, link, date, and the version published.

## Codebases

The code this package was designed against, so engineering knows where the work lands and how far the code has moved since. Table with columns `Codebase | Role | Commit grounded at | Slices that change it`. One row per codebase from the architecture's *Grounded against* table — this repository included when it holds the code. *Role* is *this repo*, *system*, *contract* or *reference*, as in `.claude/team/knowledge.md`.

## Readiness

The product lead checks each item before setting status to **Ready for engineering**. Each is verifiable against the documents; tick it only after checking.

- [ ] No document has open questions.
- [ ] Every PRD requirement is in exactly one phase.
- [ ] Every P0 and P1 requirement appears in the tech design's traceability table.
- [ ] Every `SEC-n` control is a PRD requirement and appears in the tech design's traceability table.
- [ ] Every user-facing P0 requirement is covered by a UX flow, and every surface has its states defined. *(N/A without UX.)*
- [ ] Every ADR that constrains implementation is referenced from the tech design.
- [ ] No document contradicts a D-decision.
- [ ] Every dependency between delivery slices has a seam in the tech design, with failure and concurrency behavior.
- [ ] One worked example per phase-1 flow, traced through every document, agrees everywhere it appears.
- [ ] Every codebase grounded in is recorded with its commit, and every delivery slice names the one repository it changes.

## Handoff to engineering

Written for the engineering tech lead. It will turn this into tickets; don't pre-empt that by writing them here.

- **Build first:** the phase and requirement IDs that make up the first deliverable, and why they come first.
- **Suggested slices:** a pointer to the tech design's delivery slices.
- **Work in other repositories:** slices that change a repository other than this one, and who builds them. The tech lead in this repository builds only what lands here; the rest is handed over with the same package. Write "None" if everything lands here.
- **Constraints to honor:** the ADRs and `SEC-n` controls that are non-negotiable, by ID.
- **Acceptance comes from:** PRD requirements for behavior, UX state tables for what QA exercises, `SEC-n` "verified by" for security checks.
- **Deliberately undecided:** anything the package intentionally leaves to engineering, so it isn't mistaken for an oversight.
- **Route design questions back:** if implementation finds the design wrong, raise it against this package rather than silently diverging.

To start:

```
claude --agent engineering-team:tech-lead
> Implement phase 1 of <packages_dir>/<slug>/
```

## Change log

One line per update: date, what changed, and the decisions applied.
