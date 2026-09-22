# ops — observability for the agent team itself

Everything here exists so `agent-coach` can answer one question periodically: *where is
this agent team losing time, and which definition should change?*

## Why hooks and not an agent

An agent cannot watch another agent work. Subagent conversations are isolated and are
**not** written to session transcripts — a scan of 181 local transcripts found zero
sidechain records. What *does* reach inside a subagent is hooks: tool events fire within
subagents and carry `agent_id` and `agent_type`. So the observer is a hook, and the
analyst is an agent that reads what the hook captured.

## The three layers

| Layer | Mechanism | Cost |
| ----- | --------- | ---- |
| Capture | `capture.mjs`, wired to hooks in `.claude/settings.json` | zero tokens, one short-lived process per event |
| Self-report | agents call `friction.mjs` when they hit friction they can name | one line per incident |
| Analysis | `agent-coach` agent, invoked periodically | one report |

## Where the data lives

The event stream is **outside the repo**, at `~/.claude/ops/myco/`:

- `events.jsonl` — captured hook events
- `friction.jsonl` — agent self-reports

This is deliberate. ICs run in git worktrees, so a repo-relative path would split the
log into one stream per worktree and the coach would only ever see a fraction of it. The
`STREAM` constant at the top of `capture.mjs` and `friction.mjs` is what ties them
together; both files must agree on it.

Reports, by contrast, live in the repo at `reports/` and **are** committed — they're the
durable artifact, and having them in git history is what lets the coach attribute a
change in outcomes to a change in an agent definition. `.gitignore` here keeps the
streams out.

## Which events are captured

`PostToolUseFailure`, `PermissionDenied`, `SubagentStart`, `SubagentStop`, `PreCompact`,
`TaskCreated`, `TaskCompleted`, `StopFailure`, `SessionEnd`.

Successful tool calls are deliberately **not** captured — that would spawn a process per
tool call across every agent for a marginal signal. If you want a full tool census for a
stretch, add `PostToolUse` to the hook list temporarily and remove it after.

`SubagentStop` carries `last_assistant_message`, which is the agent's own final report.
That single field is the richest thing in the stream.

## Propose-only is enforced

`guard.mjs` runs on `PreToolUse` and blocks `agent-coach` from writing
`.claude/agents/**`, `.claude/settings*.json`, and the scripts in this directory. The
coach reads freely and proposes diffs in its report; a human applies them. An agent that
can rewrite the definitions governing agents is an unbounded feedback loop, and prompt
regressions are silent — you don't get a stack trace, you get worse work three sprints
later.

The guard fails open: if it errors, it exits 0 rather than blocking legitimate work.

## Running it

```sh
# analysis (manual, periodic — weekly or after a batch of tickets)
#   invoke the agent-coach agent; it writes reports/<date>-agent-health.md

# an agent logging friction it hit
node .claude/ops/friction.mjs --agent ic-generalist --kind instructions \
  --ticket CLOUD-1234 --note "definition says run the test script but names no script"

# sanity-check the stream
wc -l ~/.claude/ops/myco/events.jsonl
```

## The report contract

`reports/TEMPLATE.md` defines a fixed YAML frontmatter block. Those keys are a contract:
always present, never renamed, `0`/`null` instead of omitted. That's what makes a series
of reports machine-diffable and lets a scheduled job mail or post one without parsing
prose. `reports/TRENDS.md` gets one appended row per report so the trend is readable at
a glance.

## Privacy

The stream captures command lines, file paths and error text, truncated. It is local and
gitignored. The coach is instructed never to lift a credential, token or customer payload
out of it into a committed report.
