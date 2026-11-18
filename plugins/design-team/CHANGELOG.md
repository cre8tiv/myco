# Changelog

## 0.6.11

- **Fix:** a decision now cascades by ID. The product lead greps the package for every requirement, `SEC`, ADR and scenario ID the decision changes and sends it to the owner of every document citing one, including documents from earlier rounds, which were the ones left stale.
- **Change:** step 7's "documents agree" check is a defined read-only audit (a `general-purpose` subagent tracing each phase-1 scenario against the PRD's decision log) that is re-run until it returns nothing, replacing a hand trace each lead had been re-inventing.
- **Fix:** `publish-review` merges the design hub from its live version after the first publish, changing only its own package's row, instead of regenerating it from one checkout, which dropped the rows of packages in other checkouts.

## 0.6.10

- **Fix:** review pages no longer show each document's YAML front matter (`type:`, `title:`, `resource:` …) as page text. `render-review.mjs` drops a front-matter block at the start of a document; a `---` rule later in a document still renders.
- **Fix:** `check-package.mjs` no longer reports a prototype as stale because another cell contains the word, such as a state named "stale model". Only the *Synced to* column is read; a table without that column counts a cell that starts with "stale".
