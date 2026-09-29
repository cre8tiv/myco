# Architecture template

Use these sections in this order. Guidance under each heading is for you; replace it with content. Mark a section N/A with a one-line reason rather than deleting it. Diagrams are Mermaid.

---

```markdown
| | |
| --- | --- |
| **Status** | Draft — N open questions |
| **PRD** | [prd.md](prd.md) |
| **Last updated** | <date> |
```

## 1. Context

What this architecture is for, in two or three sentences, and the PRD decisions that constrain it most (by D-number).

## 2. Current state

How the relevant part of the system works today, grounded in the code: the components involved, their responsibilities, and the contracts they expose. Cite paths. Mark anything you couldn't confirm.

## 3. System context

A Mermaid diagram of the system and the actors and external systems it interacts with. One sentence per external dependency on what crosses the boundary.

## 4. Components

A Mermaid container or component diagram of the target state, then a table with columns `Component | Responsibility | New / changed / existing | Owner`. A responsibility is one sentence; if it needs two, the component may be two components.

## 5. Key flows

A Mermaid sequence diagram for each flow where ordering, concurrency or failure handling matters. Under each, say what happens when each participant is slow or fails.

## 6. Data

Where each kind of data lives, who is the source of truth for it, and how it moves between components. Consistency expectations (strong, eventual, and the window). Exact schemas belong in the tech design.

## 7. Integration contracts

Every contract that crosses a component or team boundary: what crosses it, the direction, sync or async, who owns it, and how it is versioned. Flag any new public contract.

## 8. Deployment and runtime

Where each component runs, how it scales, and what it depends on at runtime. Tenancy and isolation model, if relevant.

## 9. Quality attributes

The non-functional requirements that shaped this design — scale, latency, availability, cost — with the numbers from the PRD, and how the architecture meets each.

## 10. Architecture decisions

One entry per decision:

### ADR-<n>: <title>

- **Context:** why a decision was needed, and the D-decisions constraining it.
- **Decision:** what was chosen.
- **Alternatives considered:** each rejected option and why it lost.
- **Consequences:** what this makes easier, harder, or irreversible.

## 11. Risks

Table with columns `Risk | Mitigation`.

## 12. Open questions

A numbered list, each phrased as a decision with your recommendation. Once empty, rename this section **Resolved**, listing each question with the D-decision or ADR that settled it.
