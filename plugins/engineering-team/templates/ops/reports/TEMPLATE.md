---
# Stable contract. Every key stays present on every report — use 0 or null, never omit.
report: agent-health
window_start: YYYY-MM-DD
window_end: YYYY-MM-DD
generated: YYYY-MM-DD
sessions: 0
subagent_runs: 0
tool_failures: 0
permission_denials: 0
compactions: 0
task_created: 0
task_completed: 0
review_request_changes: 0
review_approved: 0
qa_fail: 0
qa_pass: 0
friction_reports: 0
proposals: 0
proposals_net_lines: 0
prior_report: null
---

# Agent health — <window_start> to <window_end>

## Headline

Three bullets, maximum. What a reader gets if they read nothing else.

- …
- …
- …

## Outcome signals

The quality baseline this window is measured against. Rates, not just counts.

| Signal | This window | Prior window | Direction |
| ------ | ----------- | ------------ | --------- |
| Review: Request-changes rate | | | |
| QA: Fail rate | | | |
| Runs hitting compaction | | | |
| Tool-failure rate per subagent run | | | |

## Friction by agent

| Agent | Runs | Tool failures | Perm. denials | Compactions | Self-reports |
| ----- | ---- | ------------- | ------------- | ----------- | ------------ |
| | | | | | |

## Proposals

Ranked, at most five. Each needs all five parts or it belongs on the watch list.

### P1 — <one-line title>

- **Layer:** tooling | permissions | instructions | scope | environment | handoff
- **Evidence:** <counts over the window, plus one or two verbatim examples>
- **Diagnosis:** <cause, not symptom>
- **Expected effect:** <which signal should move>
- **How we'd know:** <metric and the window it should show up in>

```diff
--- a/.claude/agents/<file>.md
+++ b/.claude/agents/<file>.md
@@
-<exact existing text>
+<exact replacement text>
```

## Watch list

Patterns with fewer than three occurrences. Carried forward, not acted on.

| Pattern | Occurrences | First seen | Note |
| ------- | ----------- | ---------- | ---- |
| | | | |

## Prior proposals — did they work?

| Report | Proposal | Applied? | Signal moved? |
| ------ | -------- | -------- | ------------- |
| | | | |

## Blind spots this window

What the data could not tell you. Subagent internals are visible only through the
hook stream and self-reports, so name anything you inferred rather than observed.

- …
