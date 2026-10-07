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

For each PRD actor that touches this surface, by actor ID: the job they're trying to do, how often, the context that shapes it (device, environment, interruptions, how many at once), and what "done" feels like to them. An AI agent or system actor with no visual surface still belongs here if it reaches the product through an interface this design shapes — a CLI, an API's error messages, a notification.

## 2. Existing patterns reused

The screens, components, commands or conventions this design builds on, with where they live. Anything new, and why the existing pattern didn't fit.

## 3. Surface inventory

Table with columns `ID | Surface | Type | Purpose`. IDs are `S-1`, `S-2`. Type is screen, dialog, command, email, notification, and so on.

## 4. Flows

One Mermaid flowchart per job, each titled with the actor ID, the PRD scenario (`SC-n`) it walks through, and the requirement IDs it satisfies. Use the scenario's concrete values in the flow. Show where it can fail and where the user can abandon. Every flow ends in success, a recoverable error with a next step, or a flagged dead end.

## 5. States

For every surface: table with columns `State | What the user sees | What they can do next`. At minimum: empty, loading, partial, error, success, no-permission. Where actors see a surface differently, say which actor each row is for; the no-permission state always names the actor who hits it. This table is what QA tests against.

## 6. Wireframes

Low-fidelity layout per surface in plain text or Markdown: structure, hierarchy and content, not visual design.

## 7. Content

The actual words: labels, buttons, empty states, errors, confirmations. Error messages say what happened and what to do next.

## 8. Accessibility

What matters for these surfaces specifically: keyboard paths, focus order, labels, and anything conveyed only by color or position.

## 9. Open questions

A numbered list, each phrased as a decision with your recommendation. Once empty, rename this section **Resolved**, listing each question with the D-decision that settled it.
