# Changelog

## 0.6.10

- **Fix:** review pages no longer show each document's YAML front matter (`type:`, `title:`, `resource:` …) as page text. `render-review.mjs` drops a front-matter block at the start of a document; a `---` rule later in a document still renders.
- **Fix:** `check-package.mjs` no longer reports a prototype as stale because another cell contains the word, such as a state named "stale model". Only the *Synced to* column is read; a table without that column counts a cell that starts with "stale".
