# Changelog

## 0.6.16

- **Change:** a `package-auditor` agent for the documents-agree check, instead of a `general-purpose` agent briefed by hand. It cannot edit (no Edit or Write), reads every document at a commit SHA it is given so edits during a pass don't move what it audits, runs on an explicit model (Opus), and reports each disagreement in one shape: file:line on both sides, the supporting D-entry, the owner. The product-lead commits, dispatches it with the SHA and re-runs it at the new SHA until clean.
- **Change:** the product-lead dispatches `Explore` for codebase sweeps with `model: "haiku"`, and is told that helpers read while only the owning specialist edits a document.

## 0.6.15

- **Change:** `render-review.mjs --standalone`, for a review page opened as a file instead of published: it writes a whole HTML document (doctype, charset, viewport), and a package page with diagrams loads Mermaid 11.4.1 from jsdelivr with a Subresource Integrity hash to draw them in the page's light or dark scheme, redrawing on the toggle. Offline, or for a diagram Mermaid can't parse, the source stays. Without the flag the output is unchanged. `publish-review` uses it when it can't publish. A flag with no value no longer swallows the next argument.

## 0.6.14

- **Change:** `check-package.mjs --local-prototypes` counts an HTML prototype kept in the package (a `ux/<file>.html` path that exists) as linked, for hosts that can't publish to claude.ai. Without the flag nothing changes. The UX, package index and review summary templates say a `ux/` path is the link there.

## 0.6.13

- **Change:** review pages explain their IDs. Each ID that the package defines (in a table row, a heading or a bold lead-in) shows its definition on hover and links to it, and a collapsed "What do codes like SC-1 and A-1 mean?" key at the top lists each prefix with its area, count and first example. An ID nothing defines renders as before.
- **Change:** the Overview template, the `publish-review` step that writes it and the package index's handoff line now ask for plain words first and the ID after it, ranges named by what they cover, and names that can't be mistaken for IDs.

## 0.6.12

- **Change:** `init-design` asks whether a shared design hub already exists (or finds candidates by title), confirms the person can edit it, and records it as `review_hub`, so teammates and new checkouts share one hub instead of each creating their own.
- **Change:** `publish-review` reminds the human to share the hub with edit access to teammates who publish to it.

## 0.6.11

- **Fix:** a decision now cascades by ID. The product lead greps the package for every requirement, `SEC`, ADR and scenario ID the decision changes and sends it to the owner of every document citing one, including documents from earlier rounds, which were the ones left stale.
- **Change:** step 7's "documents agree" check is a defined read-only audit (a `general-purpose` subagent tracing each phase-1 scenario against the PRD's decision log) that is re-run until it returns nothing, replacing a hand trace each lead had been re-inventing.
- **Fix:** `publish-review` merges the design hub from its live version after the first publish, changing only its own package's row, instead of regenerating it from one checkout, which dropped the rows of packages in other checkouts.

## 0.6.10

- **Fix:** review pages no longer show each document's YAML front matter (`type:`, `title:`, `resource:` …) as page text. `render-review.mjs` drops a front-matter block at the start of a document; a `---` rule later in a document still renders.
- **Fix:** `check-package.mjs` no longer reports a prototype as stale because another cell contains the word, such as a state named "stale model". Only the *Synced to* column is read; a table without that column counts a cell that starts with "stale".
