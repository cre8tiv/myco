# PRD template

Use these sections in this order. Guidance under each heading is for you; replace it with content. Mark a section N/A with a one-line reason rather than deleting it.

---

```markdown
| | |
| --- | --- |
| **Status** | Draft — N open questions |
| **Owner** | <name> |
| **Last updated** | <date> |
| **Type** | <positioning, e.g. "Enablement tool (not a core product feature)"> |

> **Summary (human-authored):** _<left blank for the owner>_
```

## 1. Problem

Who is blocked, on what, and why it matters now. State the questions the target user can't answer today. End with what the current product or process does not do.

## 2. Positioning

What this is and isn't: product feature, enablement tool, internal tool, or service. Include who owns it, how it ships, and why this positioning (ownership, release cadence, sales motion). State what the surrounding product must provide for this to work. When a decision belongs to another group (licensing, pricing), add a subsection giving engineering's recommendation and rationale, and name the owner of the call.

## 3. Goals and non-goals

Goals are outcomes, not features. Non-goals record every scope cut decided during the loop, each written as a statement ("One-click approval from Teams").

## 4. Personas

Table of persona and need. Include internal personas (sales, field engineering, support) when the thing is a sales or enablement asset.

## 5. Solution overview

A summary. When the package includes an architecture document, keep this to the shape of the solution and link [architecture.md](architecture.md) for the detail rather than duplicating it.

- **Architecture and deployment:** the major components, where each runs, and the data paths between them.
- **Processing stages:** what happens in order, and what happens once versus per item.
- **Extension points** (if any): the plugin or integration model, its contract, and its versioning policy.

## 6. Functional requirements

One table per area, with columns `ID | Requirement | Priority`. IDs use a short area prefix (COL-1, APR-3). Priorities are P0 (first release), P1, and P2. Each requirement is testable in one sentence.

Controls required by the security review go in their own `SEC` area, keeping the security review's `SEC-n` IDs, so they are phased like every other requirement.

## 7. Data model and mapping

The core record, as a code block with field comments that mark where each field comes from and when it is set. Map every field to each external system the thing writes into. Explain any field whose value is detected or defaulted, including the default and why it is safe.

## 8. Dependencies

Table with columns `Dependency | Status (as of <date>) | Needed for`, using the grounding classification: exists-public, exists-internal, planned, missing, or verify status. For each dependency, say whether it blocks and which phase needs it.

## 9. Phasing

Table with columns `Phase | Scope (requirement IDs) | Exit criteria`. Every requirement ID appears in exactly one phase, and every exit criterion is observable.

## 10. Success metrics

How success is measured, and by what mechanism, especially when the design rules out telemetry.

## 11. Risks

Table with columns `Risk | Mitigation`. Prefix risks the human chose to live with as **Accepted risk:**.

## 12. Open questions

A numbered list. Each item is phrased as a decision, with enough context to answer it. Once the list is empty, this section becomes:

## 12. Decisions

Table with columns `# | Question | Decision`. Each decision references the sections it changed.

## 13. References

Links to every source cited during grounding.
