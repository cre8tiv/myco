# Team telemetry

`/cost-report` and `agent-coach` answer "what did this cost?" and "where did the teams struggle?" for one person's work in one project. This guide is for answering them across a team, in any observability tool: everyone's Claude Code cost, and the agent teams' cost, friction, tool failures and handoffs per design round, build phase and ticket.

It uses [OpenTelemetry](https://opentelemetry.io/) (OTel), the open standard most observability tools accept, from two sources:

| Source | What it knows | Exported as |
| --- | --- | --- |
| **Claude Code itself** | Cost and tokens per person, model, session — and per agent, skill and plugin | Metrics `claude_code.cost.usage`, `claude_code.token.usage`; events `claude_code.*` |
| **team-ops** | Cost, tokens, friction and hook events per **unit of work** — the tags leads set with `team-ops:start-work` — and per agent | Metrics `team_ops.work.*`; events `team_ops.*` |

They use separate names on purpose: Claude Code's cost is the total, team-ops' breaks the agent teams' share of it down by work. Never add one to the other.

Costs are API-equivalent estimates at list prices. A Team or Max subscription bills differently; for billing, use your Claude admin console or API provider.

## Where to send it

You need somewhere that accepts OTLP — the OTel protocol — and can chart it. Pick one:

| You have | Do this |
| --- | --- |
| **An observability platform already** (Datadog, Grafana, New Relic, Honeycomb, an OTel collector) | Point both sources at its OTLP endpoint. Import [the dashboard](stack/grafana/dashboards/agent-teams.json) if it's Grafana. |
| **Nothing, and data may leave your network** | A hosted service's free tier — Grafana Cloud and Honeycomb both take OTLP metrics and logs directly, with an endpoint URL and an API key. No servers to run. |
| **Nothing, and data must stay in** | Run [the example stack](#the-example-stack): an OTel collector, Prometheus, Loki and Grafana in Docker, with the dashboard ready. |
| **Only Anthropic's view** | The Claude admin console (Team and Enterprise plans) or the Usage and Cost API shows cost per person — not per agent or unit of work. No setup. |

## 1. Turn on Claude Code's export

Organization-wide, through [managed settings](https://code.claude.com/docs/en/managed-settings), so nobody has to opt in:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp.example.com",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer <token>"
  }
}
```

`OTEL_LOGS_EXPORTER` adds Claude Code's own events — every API request, tool result and permission decision. Leave it out if metrics are all you want.

For one person or a small team without managed settings, put the same `env` block in each person's `~/.claude/settings.json`. **Not in a repository's `.claude/settings.json`:** Claude Code ignores exporter settings there, so a cloned repository can't send your data anywhere.

**Agent names.** For plugins outside Anthropic's official marketplace — these teams included — Claude Code reports agent, skill and plugin names as `third-party` or `custom` unless `OTEL_LOG_TOOL_DETAILS=1`. That flag also exports Bash commands, file paths and tool arguments, so turn it on only if your backend is approved to hold those. You don't need it to see the teams: everything team-ops exports carries the agent name.

**What else it sends.** Every metric carries the person's email when they sign in with a Claude account. Prompt text, responses and file contents aren't sent unless you turn on the `OTEL_LOG_*` content flags.

**If your organization already exports Claude Code's telemetry** through managed settings, its endpoint wins over anything you set yourself — Claude Code's telemetry goes to the organization's collector, not your stack. Ask whoever runs that collector to forward it, or send team-ops' to the same collector. team-ops' own settings aren't affected.

The full reference: [Monitoring](https://code.claude.com/docs/en/monitoring-usage).

## 2. Turn on team-ops' export

Claude Code doesn't pass its `OTEL_*` settings to plugin hooks, so team-ops has its own. Set them in the same `env` block:

```json
{
  "env": {
    "TEAM_OPS_OTLP_ENDPOINT": "https://otlp.example.com",
    "TEAM_OPS_OTLP_HEADERS": "Authorization=Bearer <token>",
    "TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES": "team.id=platform"
  }
}
```

| Variable | |
| --- | --- |
| `TEAM_OPS_OTLP_ENDPOINT` | Turns the export on. The OTLP/HTTP base URL (`…:4318`); metrics go to `/v1/metrics` and events to `/v1/logs` under it. |
| `TEAM_OPS_OTLP_HEADERS` | Optional. `key=value` pairs, comma-separated, URL-encoded — the same format as `OTEL_EXPORTER_OTLP_HEADERS`. |
| `TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES` | Optional. `key=value` pairs added to every export, such as a team name to filter the dashboard by. |
| `TEAM_OPS_OTLP_LOG_CONTENT` | Optional. `1` adds free text to events: friction notes, agents' final reports, error messages, commands and file paths. Off by default — see [What leaves the machine](#what-leaves-the-machine). |

It sends OTLP over HTTP with a JSON body, which most backends and every OTel collector accept; a backend that takes only gRPC or protobuf needs a collector in front of it. Each send waits at most 2 seconds and never fails a session or an agent's work.

**When it sends.** Cost when a team agent finishes and when a lead session ends, carrying the session's whole running total, so a resend is harmless and a failed one is made good by the next. Each event as it happens, once: a failed send is noted and the event stays in the local file. `/cost-report` re-reads sessions that never finished cleanly and exports their cost too.

**History.** Cost recorded before you turned the export on stays local until you send it: run `node "<team-ops>/scripts/cost.mjs" --export` in each project, or ask a lead to run `team-ops:cost-report` with `--export`. Earlier events aren't re-sent.

**Is it working?** `~/.claude/ops/<stream>/otlp-status.json` records the last send of each signal: when, where, how much, and the error if it failed.

## The data

Everything team-ops records — locally in `~/.claude/ops/<stream>/` and in the export — shares one set of fields, so friction, failures and cost can be joined on the work they belong to.

### Shared fields

| OTel attribute | Local field | |
| --- | --- | --- |
| `session.id` *(resource)* | `session` | The Claude Code session. Also `service.instance.id`. |
| `service.name` *(resource)* | — | Always `team-ops`. |
| `team_ops.stream` | the directory name | The project's stream, from `stream:` in its team profile. |
| `agent` | `agent` | The full agent name: `design-team:architect`, `engineering-team:ic-generalist`. |
| `agent.id` | `agent_id` | One run of a subagent. Events only; metrics add up across runs. |
| `work` | `work` | The unit of work: a tag set with `team-ops:start-work` (`order-exceptions/round-2`, `order-exceptions/phase-1`), an agent's own `[TICKET]` tag, or `(untagged)`. |
| `parent_work` | `parent_work` | The lead's tag when the agent had its own — the phase a ticket belongs to. |
| custom | — | Anything in `TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES`. |

### Metrics

| Name | Unit | Extra attributes |
| --- | --- | --- |
| `team_ops.work.cost` | USD | `model`, `speed` |
| `team_ops.work.token.usage` | tokens | `model`, `speed`, `type` — `input`, `output`, `cacheRead`, `cacheCreation`, as Claude Code names them |

Cumulative sums, one series per session. A session's cost in a time range is the largest value its series reached; a range's cost is the sum of those:

```promql
# Agent-team cost per unit of work, over the dashboard's range
sum by (work) (max_over_time(team_ops_work_cost_USD_total[$__range]))

# Everything Claude Code spent, per person
sum by (user_email) (max_over_time(claude_code_cost_usage_USD_total[$__range]))
```

A session that runs across the start of the range is counted whole. `increase()` undercounts a series with only one sample, which team-ops' often have, so don't use it for totals. Prometheus names, with the collector's default translation: `team_ops_work_cost_USD_total`, `team_ops_work_token_usage_tokens_total`.

### Events

OTel log records, with the event name in both `eventName` and the `event.name` attribute, as Claude Code's own events have it.

| Event | When | Severity | Extra attributes | With content on |
| --- | --- | --- | --- | --- |
| `team_ops.friction` | An agent reported friction with `team-ops:log-friction` | WARN | `friction.kind` — `instructions`, `tooling`, `permissions`, `scope`, `environment`, `handoff` | body: the note |
| `team_ops.tool_failure` | A team agent's tool call failed | WARN | `tool.name`, `hook.event` | `tool.target`, `error.message`; body: the error |
| `team_ops.permission_denied` | A team agent was refused a tool call | WARN | `tool.name`, `hook.event` | `tool.target`, `reason` |
| `team_ops.stop_failure` | A turn ended on an error | WARN | `hook.event` | `error.message` |
| `team_ops.agent_start` | A team agent started | INFO | `hook.event` | `task.description` |
| `team_ops.agent_stop` | A team agent finished | INFO | `hook.event` | body: its final report |
| `team_ops.compaction` | A team agent's context was compacted — usually a task scoped too large | INFO | `hook.event` | |
| `team_ops.task_created`, `team_ops.task_completed` | Task list changes | INFO | `hook.event` | `task.description` |
| `team_ops.session_end` | A team lead session ended | INFO | `hook.event` | `reason` |

Every event may also carry `permission.mode` and `effort`. Design problems engineering sends back to a design package are `team_ops.friction` with `friction.kind` `handoff` and `work` set to the package — the cross-team signal the coach weighs most.

```logql
# Friction per unit of work and kind, in Loki
sum by (work, friction_kind) (count_over_time({service_name="team-ops"} | event_name="team_ops.friction" [$__range]))
```

Loki stores OTel attributes as structured metadata, with dots turned into underscores.

### What leaves the machine

By default, events carry only names and categories: which agent, which work, which tool, what kind of friction. The free text — friction notes, agents' final reports, error messages, commands, file paths, task descriptions — can contain code, customer names or credentials that leaked into an error, so it stays in the local files unless `TEAM_OPS_OTLP_LOG_CONTENT=1`. Turn it on only if your backend is approved to hold what your sessions see.

### Local files

The same records, in `~/.claude/ops/<stream>/`: `events.jsonl` (hook events, one per line, with `ts` and `event` — the hook's name), `friction.jsonl` (with `ts`, `kind` and `note`), and `usage.jsonl` (token snapshots; see the team-ops README). They always hold the free text. Friction recorded before this version has `ticket` where newer records have `work`, and no `session`.

## The example stack

[`stack/`](stack/) is an OTel collector, Prometheus for metrics, Loki for events and Grafana in Docker Compose, with the dashboard provisioned. It's a starting point for a team to run and secure itself, not a supported service.

```sh
cd plugins/team-ops/telemetry/stack
GRAFANA_ADMIN_PASSWORD=<choose one> docker compose up -d
```

Then point both exports at it, with no headers:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
    "TEAM_OPS_OTLP_ENDPOINT": "http://localhost:4318"
  }
}
```

Grafana is at http://localhost:3000 (set `GRAFANA_PORT` if 3000 is taken); the *Agent teams* dashboard is its home page: cost by work, agent, person and model, then friction by kind and agent, tool failures, problems per unit of work, and the friction reports themselves. Claude Code exports metrics every minute, team-ops when work finishes, and Prometheus scrapes every 15 seconds.

**Before a team shares it:** every port is bound to the machine it runs on. To collect from a team, put the collector behind TLS with authentication (an `Authorization` header checked by a reverse proxy or the collector's `bearertokenauth` extension), put Grafana behind your sign-in, and change the admin password. Prometheus and Loki keep 400 days of data in Docker volumes; back them up if the history matters.

**Already have Grafana?** Import [`agent-teams.json`](stack/grafana/dashboards/agent-teams.json) and pick your Prometheus and Loki data sources. It assumes the collector's Prometheus exporter naming (`translation_strategy: UnderscoreEscapingWithSuffixes`) with resource attributes as labels, and Loki's native OTLP ingestion — see [`otel-collector.yaml`](stack/otel-collector.yaml).
