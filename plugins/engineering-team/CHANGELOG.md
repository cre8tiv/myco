# Changelog

## 0.5.9

- **Fix:** QA runs no longer end without a `report.md`. The harness refuses a subagent's Write of `report.md`, so `qa-specialist` returns the report as text and the tech lead saves it verbatim to the run directory and commits it to the ticket branch before merge. The merge gate is unchanged.

## 0.5.8

- **Fix:** `check-package.mjs` (shared with design-team) no longer reports a prototype as stale because another cell contains the word, such as a state named "stale model". Only the *Synced to* column is read; a table without that column counts a cell that starts with "stale".
