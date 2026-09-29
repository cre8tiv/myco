# UX template

Use these sections in this order. Guidance under each heading is for you; replace it with content. Mark a section N/A with a one-line reason rather than deleting it. Flows are Mermaid; wireframes are plain text.

---

```markdown
| | |
| --- | --- |
| **Status** | Draft — N open questions |
| **PRD** | [prd.md](prd.md) |
| **Last updated** | <date> |
```

## 1. Users and jobs

For each persona in the PRD that touches this surface: the job they're trying to do, how often, and what "done" feels like to them.

## 2. Existing patterns reused

The screens, components, commands or conventions this design builds on, with where they live. Anything new, and why the existing pattern didn't fit.

## 3. Surface inventory

Table with columns `ID | Surface | Type | Purpose`. IDs are `S-1`, `S-2`. Type is screen, dialog, command, email, notification, and so on.

## 4. Flows

One Mermaid flowchart per job, each titled with the requirement IDs it satisfies. Show where it can fail and where the user can abandon. Every flow ends in success, a recoverable error with a next step, or a flagged dead end.

## 5. States

For every surface: table with columns `State | What the user sees | What they can do next`. At minimum: empty, loading, partial, error, success, no-permission. This table is what QA tests against.

## 6. Wireframes

Low-fidelity layout per surface in plain text or Markdown: structure, hierarchy and content, not visual design.

## 7. Content

The actual words: labels, buttons, empty states, errors, confirmations. Error messages say what happened and what to do next.

## 8. Accessibility

What matters for these surfaces specifically: keyboard paths, focus order, labels, and anything conveyed only by color or position.

## 9. Open questions

A numbered list, each phrased as a decision with your recommendation. Once empty, rename this section **Resolved**, listing each question with the D-decision that settled it.
