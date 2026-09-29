# Tech design template

Use these sections in this order. Guidance under each heading is for you; replace it with content. Mark a section N/A with a one-line reason rather than deleting it.

---

```markdown
| | |
| --- | --- |
| **Status** | Draft — N open questions |
| **Implements** | [prd.md](prd.md) phases <n–m> |
| **Architecture** | [architecture.md](architecture.md) · **Security** | [security-review.md](security-review.md) |
| **Last updated** | <date> |
```

## 1. Overview

What gets built, in one paragraph, and which PRD phases this document covers.

## 2. Codebase conventions followed

The existing patterns this design reuses — how the codebase defines an endpoint, a table, a migration, a job, a flag, a test — with paths. Any new pattern, with the reason it's needed.

## 3. Component changes

Per component from the architecture: what changes, what's new, what's removed. Reference ADRs by number.

## 4. Interfaces and contracts

Every endpoint, message, event, command or public function engineering will implement against: shapes, errors, idempotency, pagination, versioning. Use the project's own notation (OpenAPI, protobuf, type definitions) where it has one.

## 5. Data model and migrations

Schema changes, as the project expresses them. For each migration: reversible or not, behavior on existing data, expected duration at production volume, and whether it needs a backfill or a maintenance window.

## 6. Key flows

The flows from the architecture, now at implementation depth: which module does what, where transactions begin and end, retries, timeouts, and what happens on each failure.

## 7. Configuration and feature flags

New settings and flags, their defaults, and who changes them.

## 8. Rollout, compatibility and rollback

Deployment order, backward and forward compatibility during rollout, what a partially rolled-out state looks like, and how to roll back each step.

## 9. Observability

The logs, metrics and alerts that show this working — and that show it failing before a user reports it.

## 10. Test strategy

What unit, integration and end-to-end tests prove, and what the QA specialist should exercise against a running build. Name the hard cases explicitly: concurrency, partial failure, large data, permission boundaries.

## 11. Traceability

Table with columns `Requirement | Implemented in | Verified by`. One row for every P0 and P1 requirement in the PRD and every `SEC-n` control from the security review. No blank cells — a requirement that can't be designed in is an open question, not a blank.

## 12. Delivery slices

Suggested independently shippable increments, aligned to PRD phases: table with columns `Slice | Scope (requirement IDs) | Depends on | Notes`. These are guidance for the tech lead's decomposition, not tickets.

## 13. Risks

Table with columns `Risk | Mitigation`.

## 14. Open questions

A numbered list, each phrased as a decision with your recommendation. Once empty, rename this section **Resolved**, listing each question with the D-decision or ADR that settled it.
