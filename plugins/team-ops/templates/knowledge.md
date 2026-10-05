---
# Written by /init-knowledge, which /init-design and /init-team run as part of setup.
# Shared by every team: one list of the docs and knowledge bases this project relies on.
# Edit freely; re-run /init-knowledge to re-detect and re-verify.
generated: <YYYY-MM-DD>
---

# Knowledge sources

Where agents look for answers before inferring from the code or from memory. When a
source below covers a question an agent has, the agent consults it first.

## Sources

| Source | How to reach it | Answers | Used by | Authority | Access |
| ------ | --------------- | ------- | ------- | --------- | ------ |
| <e.g. Product docs> | <`mcp__product_docs__*`, or a URL via WebFetch, or a repo path> | <the questions it answers — e.g. "what the product publicly supports: features, APIs, limits"> | <roles — e.g. product-lead, architect, qa-specialist> | <authoritative / internal / community> | <authorized / needs per-person authorization / public> |

**Authority** tells agents how much weight a source carries:

- **authoritative** — the supported, published contract: product docs, API references, policy. When the design team grounds a dependency, this is what makes it *exists-public*.
- **internal** — accurate but not a promise to anyone: engineering wikis, design notes, knowledge graphs, runbooks. A capability found only here is *exists-internal*.
- **community** — useful but unverified: forums, third-party docs, Q&A sites. Confirm before relying on it.

## Needs authorization

Connectors that are configured but not authorized for the person running the agents.
Authorization is per person: each teammate authorizes once, through claude.ai
**Settings → Connectors** or `/mcp`. Until then, agents can't reach these sources.

- <e.g. Product docs MCP — authorize to let the design team check public capabilities>

## Not available

Sources the team would use but that this project can't reach yet, so the gap is known
rather than rediscovered.

- <e.g. Support knowledge base — no MCP server; ask support for an export>
