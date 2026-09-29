# Security review template

Use these sections in this order. Guidance under each heading is for you; replace it with content. Mark a section N/A with a one-line reason rather than deleting it.

---

```markdown
| | |
| --- | --- |
| **Status** | Draft — N open questions |
| **Reviewed** | [architecture.md](architecture.md) as of <date or commit> |
| **Last updated** | <date> |
```

## 1. Scope

What was reviewed, what was deliberately out of scope and why, and the compliance obligations from `design.md` that apply.

## 2. Data classification

Table with columns `Data | Classification | Where it lives | Who can access it`. Use the classification scheme in `design.md` if it has one.

## 3. Trust boundaries and data flows

A Mermaid data-flow diagram showing components, data stores, external actors, and the trust boundaries between them. Every flow that crosses a boundary is a candidate for the threat model.

## 4. Existing controls

What the current system already provides — authentication, authorization, secrets management, tenancy isolation, audit logging — with paths. The design should reuse these unless there's a stated reason not to.

## 5. Threat model

Table with columns `ID | Flow or component | Threat | STRIDE | Likelihood | Impact | Mitigated by`. IDs are `T-1`, `T-2`. Include only credible threats — ones someone would plausibly attempt and that would matter if they succeeded.

## 6. Required controls

Table with columns `ID | Control | Mitigates | Priority | Verified by`. IDs are `SEC-1`, `SEC-2`. Priority uses the PRD's P0/P1/P2. "Verified by" names a test, review check, or configuration assertion. Every control here becomes a PRD requirement in the `SEC` area and must appear in the tech design's traceability table.

## 7. Authentication and authorization

Who can do what, how identity is established, and where each permission check is enforced. Name the enforcement point — a check in the wrong layer is a common way a correct policy fails.

## 8. Secrets, audit and logging

How credentials and keys are stored and rotated; which actions are audited and where; what must never be logged.

## 9. Residual risk

What remains after the controls. Risks the human has chosen to accept are marked **Accepted risk:** with the D-decision that accepted them.

## 10. Open questions

A numbered list, each phrased as a decision with your recommendation. Once empty, rename this section **Resolved**, listing each question with the D-decision that settled it.
