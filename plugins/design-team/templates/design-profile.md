---
# Written by the product-lead the first time it's needed; edited by humans after that.
# The design-team agents read this for anything specific to THIS project.
packages_dir: docs/design
generated: <YYYY-MM-DD>
---

# Design profile

## Where design packages live

- **Package directory:** `docs/design/<slug>/` (change `packages_dir` above to move it)
- **Also publish to:** <e.g. a Confluence space and parent page, or "nowhere — the repo is the only copy">
- **How packages get reviewed:** <a branch and PR per package | direct commits | review in the published copy>
- **Who signs off:** <names or roles whose agreement makes a package "Ready for engineering">

## Where to ground

The systems the product lead and specialists should search before recommending anything.

- **Tracker:** <e.g. Jira project KEY, via `mcp__atlassian__*`>
- **Wiki / docs:** <e.g. Confluence spaces, a docs/ directory>
- **Repos:** <this repo, plus any others the work commonly touches>
- **Prior design packages:** <where earlier PRDs and designs live, if not in packages_dir>

## Security and compliance context

- **Frameworks and obligations:** <e.g. SOC 2, GDPR, HIPAA — or "none beyond standard practice">
- **Data classification scheme:** <the scheme's levels, or "public / internal / confidential / restricted">
- **Existing security mechanisms to reuse:** <auth provider, secrets store, audit log>

## Design system and UX conventions

- **Component library / design system:** <name and where it lives, or "none">
- **Surfaces this product has:** <web app, CLI, API, email, mobile>
- **Fidelity expected from UX:** <low-fi wireframes and state tables (default) | higher-fidelity mockups>

## Conventions and gotchas

<Anything that has bitten a design here before: a dependency that's always "planned" but never ships, a team that must be consulted on any auth change, a platform limit.>
