# PR Lens CLI reference

Everything the skill runs, and the shape of the document it writes.

## Commands

Run without installing, pinned to the latest at call time:

```sh
npx --yes @coldtea/pr-lens-cli@latest validate .pr-lens/graph.json
npx --yes @coldtea/pr-lens-cli@latest render .pr-lens/graph.json --theme dark
npx --yes @coldtea/pr-lens-cli@latest canvas push          # a full-screen view link, no PR needed
```

- **`validate <file>`** checks a document or a `.github/pr-lens.yml` config. Non-zero exit means the document is wrong; fix it and run again.
- **`render <file>`** writes the SVG(s) next to the document and prints their paths. Pass one of those paths to `gh pr create --attach`. `render` also reports any config correction that matched nothing — a correction matching nothing is one nobody is getting.
- **`canvas push`** uploads the document and prints a view link at `prlens.dev/c/<id>`; it also prints an edit link carrying a write token in its fragment, which stays out of any reply unless someone asks for it.

## Document skeleton

A valid document is small. This is the whole surface worth knowing day to day:

```json
{
  "schemaVersion": "0.1.1",
  "lenses": ["architecture", "data-flow"],
  "lanes": [{ "id": "api", "label": "API" }],
  "nodes": [
    { "id": "signup-route", "label": "POST /signup", "lane": "api", "delta": "modified" }
  ],
  "edges": [{ "from": "signup-route", "to": "welcome-service", "kind": "event", "delta": "added" }]
}
```

- `delta` is one of `added`, `modified`, `removed`, `unchanged`. Mark the neighbours the change *did not* touch as `unchanged` — that is what makes blast radius visible.
- `lenses` selects `architecture` (structural) and/or `data-flow` (a request in sequence).
- A **walkthrough** is an optional guided tour: two to twelve steps, each naming one node or edge and one change word (added, removed, replaced, now, moved, split). A heading that could have been true before the PR is not a change heading.
- Every id an edge or step names must be declared, or `validate` fails with `BROKEN_REFERENCE`.

The field-by-field contract, with limits and the mistakes documents usually make, is upstream: <https://prlens.dev/guides/pr-lens-graph-document>.

## Repository config

`.github/pr-lens.yml` corrects a diagram without editing the generated document. It is an overlay, reapplied on every run, so a correction keeps holding as the code moves. The correction format is upstream: <https://prlens.dev/guides/configure-pr-lens>.

A rule keyed to a path glob survives the model renaming a node; a rule keyed to `id:` does not. Prefer the glob.
