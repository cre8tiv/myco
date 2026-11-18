# Changelog

## 0.5.8

- **Fix:** `check-package.mjs` (shared with design-team) no longer reports a prototype as stale because another cell contains the word, such as a state named "stale model". Only the *Synced to* column is read; a table without that column counts a cell that starts with "stale".
