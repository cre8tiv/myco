---
name: pr-lens
description: Draw a pull request as an architecture and data-flow diagram with PR Lens and attach it to the PR description, so a reviewer meets the shape of the change before the diff. Run when opening or updating a pull request and this project wants diagrams, or when a reviewer asks what a change touches; skip docs-only, version-bump and lockfile changes, where a diagram says nothing a sentence can't.
---

# pr-lens

A diff shows what changed; it does not show what the change sits inside. A reviewer rebuilds the system in their head before they can judge anything. This skill draws that system — the parts the change touched and the parts it didn't — as one SVG and puts it at the top of the pull request, where a reviewer meets it before the first line of the diff.

It runs on your own token budget: you already read the diff, so you describe it. There is no second model and no API key in this path.

**The project opts in, or someone asks.** `project.md` records whether this project draws PR Lens diagrams. If the profile is missing or says `none`, don't run this on your own — but a direct request for a picture of the change is enough to run it.

## When it's worth the time

Run it for a change with a shape worth seeing: new modules, moved boundaries, a request path that now goes somewhere new, a schema that moved, a dependency the change reaches across. Skip it for docs-only, version bumps and lockfile churn — a diagram of nothing spends a reviewer's attention for no return.

## The loop

1. **Read the change against the merge base**, not the tip of the base branch:

   ```sh
   git diff --find-renames "$(git merge-base HEAD origin/"$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##')")"...HEAD
   ```

   A diff against the tip blames this change for everything that landed on the trunk since it forked.

2. **Write the document** to `.pr-lens/graph.json`, following `references/cli.md`. Include the *unchanged* neighbours the change sits between — a diagram of only the changed nodes says nothing about blast radius. Lanes are the reader's mental model (a runtime, a tier, a boundary), not the folder tree. One hero edge: the connection the change is really about.

3. **Validate, and fix every failure:**

   ```sh
   npx --yes @coldtea/pr-lens-cli@latest validate .pr-lens/graph.json
   ```

   Never render an invalid document, and never "fix" a failure by deleting the element the error names — the error is a path into a document that is wrong. Four codes cover most of it: `BROKEN_REFERENCE`, `INVALID_DOCUMENT`, `DUPLICATE_ID`, `UNSUPPORTED_SCHEMA_VERSION`.

4. **Render:**

   ```sh
   npx --yes @coldtea/pr-lens-cli@latest render .pr-lens/graph.json --theme dark
   ```

5. **Attach it to the PR description.** Reference the SVG as a Markdown image in the body file, then pass the same path to `--attach`; `gh` rewrites the reference to the uploaded asset and keeps the alt text:

   ```sh
   gh pr create --title "<title>" --body-file .pr-lens/body.md --attach .pr-lens/overview-dark-<hash>.svg
   ```

   Put the diagram in *the description*, not a trailing comment — a reviewer should meet the picture before the diff. The reference must be a Markdown image: an exclamation mark, the alt text in square brackets, then the path in round brackets. An HTML `<img>` is left as written and the file is appended at the end instead. The alt text is what a reader without images gets, so it says what the diagram shows in one line. Check `gh --version` first: `--attach` arrived in GitHub CLI 2.99.

   When updating a PR that already has a diagram, re-render and edit the body — don't post a second comment.

## What a diagram is not

PR Lens is the comprehension layer. There is no field for a bug, a risk or a security note, and a document that invents one is rejected rather than trimmed. Findings belong in your review comment, in words.

## Keep the artifact out of the commit

`.pr-lens/graph.json` is regenerated on every run, so it does not belong in the change. Add `.pr-lens/` to the project's `.gitignore` (or write the document to a scratch directory) and commit nothing from it — the picture reaches the reviewer through the PR description, which is the one place they will read it.

## When the tool isn't reachable

If `npx` can't fetch the CLI — no network, a locked-down registry — don't stall the PR. Open it without a diagram and say so in your handoff; the change is still reviewable. Note it with the `team-ops:log-friction` skill, kind `tooling`.
