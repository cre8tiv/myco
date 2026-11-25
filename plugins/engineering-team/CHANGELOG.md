# Changelog

## 0.5.14

- **Change:** the QA library's location is configurable. `project.md` gains `qa_dir` (repository-relative, default `.claude/qa`, so existing projects change nothing). The merge gate, `qa-specialist`, the tech lead, the PR template and `agent-coach` read it instead of a fixed path, and `/init-team` asks where the library should live and scaffolds it there. A value that is absolute or contains `..` is treated as unset, because the gate passes it to git. `/init-team` never moves an existing library: moving one is two steps for the user, `git mv` and setting `qa_dir`.

## 0.5.13

- **Fix:** isolated agents run each `git` command as its own Bash call and edit files only with Write and Edit, never a `python3 - <<EOF` script. In the first week of engineering use, the worktree guard caused 122 of 293 tool failures, from chained git commands and script edits that the old wording ("no heredocs") didn't cover. Applies to the IC, QA and tech-lead agents through the shared `no-heredocs` block, even when the user's own instructions say to batch commands.

## 0.5.12

- **Change:** PR descriptions and ticket text are written for a human reviewer who never read the design package. New `templates/pr-description.md` (summary with an example, why, before/after table, a *How to read this PR* size table for large PRs, rollout, testing with verified numbers only, merge order, design IDs only in the last line, plus the ticket description and validation-field forms). ICs use it and rewrite the whole body after every push instead of appending a review changelog.
- **Change:** the tech lead owns the phase merge order across a multi-PR ticket and keeps it current in every PR and ticket, fills the ticket's validation field with links to the saved QA reports and human check steps, writes developer notes from the final head (as a comment once a field locks), and checks PR and ticket text for readability and stale facts before the human-approval handoff.
- **Change:** `project.md` records the technical and solution description fields, which fields lock after which transition, the markup limits of long-text fields, and an optional writing style; `init-team` discovers them.

## 0.5.11

- **Change:** `check-package.mjs --local-prototypes`, as in design-team 0.6.14 (this is its copy).

## 0.5.10

- **Change:** the PR feedback loop. The tech lead watches a PR for bot and human feedback after review, after QA and before merge (optionally waiting on `gh event listen`), routes each new finding, and replies and resolves bot threads once fixed or declined. `project.md` gains fields for how findings appear, how to ask for a re-review, who resolves threads and the conventions bots enforce; `init-team` fills them in and checks that agents can read and resolve review threads.
- **Change:** ICs check the repo's bot-enforced conventions before pushing, stop citing design-document IDs in code, and report which thread and commit a fix answers.

## 0.5.9

- **Fix:** QA runs no longer end without a `report.md`. The harness refuses a subagent's Write of `report.md`, so `qa-specialist` returns the report as text and the tech lead saves it verbatim to the run directory and commits it to the ticket branch before merge. The merge gate is unchanged.

## 0.5.8

- **Fix:** `check-package.mjs` (shared with design-team) no longer reports a prototype as stale because another cell contains the word, such as a state named "stale model". Only the *Synced to* column is read; a table without that column counts a cell that starts with "stale".
