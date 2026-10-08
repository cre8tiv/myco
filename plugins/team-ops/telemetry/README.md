# Team cost telemetry

`/cost-report` answers "what did this cost?" for one person's work in one project. This guide is for answering it across a team: everyone's Claude Code cost, and the agent teams' cost per design round, build phase and ticket, in one dashboard.

It uses [OpenTelemetry](https://opentelemetry.io/) (OTel), the open standard most observability tools accept, and two sources of metrics:

| Source | What it knows | Metric |
| --- | --- | --- |
| **Claude Code itself** | Cost and tokens per person, model, session — and per agent, skill and plugin | `claude_code.cost.usage`, `claude_code.token.usage` |
| **team-ops** | Cost and tokens per **unit of work** — the tags leads set with `team-ops:start-work` — and per agent | `team_ops.work.cost`, `team_ops.work.token.usage` |

They're separate metric names on purpose: Claude Code's are the total, team-ops' break the agent teams' share of it down by work. Never add one to the other.

Both are API-equivalent estimates at list prices. A Team or Max subscription bills differently; for billing, use your Claude admin console or API provider.

## Where to send it

You need somewhere that accepts OTLP — the OTel protocol — and can chart it. Pick one:

| You have | Do this |
| --- | --- |
| **An observability platform already** (Datadog, Grafana, New Relic, Honeycomb, an OTel collector) | Point both sources at its OTLP endpoint. Import [the dashboard](stack/grafana/dashboards/agent-teams-cost.json) if it's Grafana. |
| **Nothing, and data may leave your network** | A hosted service's free tier — Grafana Cloud and Honeycomb both take OTLP directly, with an endpoint URL and an API key. No servers to run. |
| **Nothing, and data must stay in** | Run [the example stack](#the-example-stack): an OTel collector, Prometheus and Grafana in Docker, with the dashboard ready. |
| **Only Anthropic's view** | The Claude admin console (Team and Enterprise plans) or the Usage and Cost API shows cost per person — not per agent or unit of work. No setup. |

## 1. Turn on Claude Code's export

Organization-wide, through [managed settings](https://code.claude.com/docs/en/managed-settings), so nobody has to opt in:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp.example.com",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer <token>"
  }
}
```

For one person or a small team without managed settings, put the same `env` block in each person's `~/.claude/settings.json`. **Not in a repository's `.claude/settings.json`:** Claude Code ignores exporter settings there, so a cloned repository can't send your data anywhere.

**Agent names.** For plugins outside Anthropic's official marketplace — these teams included — Claude Code reports agent, skill and plugin names as `third-party` or `custom` unless `OTEL_LOG_TOOL_DETAILS=1`. That flag also exports Bash commands, file paths and tool arguments, so turn it on only if your backend is approved to hold those. You don't need it for cost per agent: team-ops' metrics carry the agent name either way.

**What else it sends.** Every metric carries the person's email when they sign in with a Claude account. Prompt text, responses and file contents aren't sent unless you turn on the `OTEL_LOG_*` content flags; leave them off for cost tracking.

**If your organization already exports Claude Code's telemetry** through managed settings, its endpoint wins over anything you set yourself — Claude Code's metrics go to the organization's collector, not your stack. Ask whoever runs that collector to forward them, or add team-ops' metrics to the same collector. team-ops' own settings aren't affected.

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
| `TEAM_OPS_OTLP_ENDPOINT` | Turns the export on. The OTLP/HTTP base URL (`…:4318`), or the full `/v1/metrics` URL. |
| `TEAM_OPS_OTLP_HEADERS` | Optional. `key=value` pairs, comma-separated, URL-encoded — the same format as `OTEL_EXPORTER_OTLP_HEADERS`. |
| `TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES` | Optional. `key=value` pairs added to every export, such as a team name to filter the dashboard by. |

It sends OTLP over HTTP with a JSON body, which most backends and every OTel collector accept; a backend that takes only gRPC or protobuf needs a collector in front of it. Each send waits at most 2 seconds and never fails a session.

**When it sends.** When a team agent finishes and when a lead session ends — the same moments usage is recorded locally. Each send carries the session's whole running total per work tag, agent and model, with the session as the series, so a resend is harmless and a failed one is made good by the next. `/cost-report` re-reads sessions that never finished cleanly, and exports those too.

**History.** Usage recorded before you turned the export on stays local until you send it: run `node "<team-ops>/scripts/cost.mjs" --export` in each project, or ask a lead to run `team-ops:cost-report` with `--export`.

**Is it working?** `~/.claude/ops/<stream>/otlp-status.json` records the last send: when, where, how many sessions, and the error if it failed.

## Reading the numbers

Each series is one session's running total, so a session's cost in a time range is the largest value its series reached, and a range's cost is the sum of those. In PromQL:

```promql
# Agent-team cost per unit of work, over the dashboard's range
sum by (work) (max_over_time(team_ops_work_cost_USD_total[$__range]))

# Everything Claude Code spent, per person
sum by (user_email) (max_over_time(claude_code_cost_usage_USD_total[$__range]))
```

A session that runs across the start of the range is counted whole. `increase()` undercounts a session whose series has only one sample, which team-ops' often do, so the dashboard doesn't use it for totals.

Labels on team-ops' metrics: `work` (the tag, or `(untagged)`), `parent_work` (the lead's tag when an agent had its own, such as a ticket within a phase), `agent`, `model`, `speed`, `team_ops_stream`, and for tokens `type` (`input`, `output`, `cacheRead`, `cacheCreation`, as Claude Code names them). Prometheus names: `team_ops_work_cost_USD_total`, `team_ops_work_token_usage_tokens_total`.

## The example stack

[`stack/`](stack/) is an OTel collector, Prometheus and Grafana in Docker Compose, with the dashboard provisioned. It's a starting point for a team to run and secure itself, not a supported service.

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
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
    "TEAM_OPS_OTLP_ENDPOINT": "http://localhost:4318"
  }
}
```

Grafana is at http://localhost:3000 (set `GRAFANA_PORT` if 3000 is taken); the *Agent teams: cost* dashboard is its home page. Claude Code exports every minute, team-ops when work finishes, and Prometheus scrapes every 15 seconds.

**Before a team shares it:** every port is bound to the machine it runs on. To collect from a team, put the collector behind TLS with authentication (an `Authorization` header checked by a reverse proxy or the collector's `bearertokenauth` extension), put Grafana behind your sign-in, and change the admin password. Prometheus keeps 400 days of data in a Docker volume; back it up if the history matters.

**Already have Grafana?** Import [`agent-teams-cost.json`](stack/grafana/dashboards/agent-teams-cost.json) and pick your Prometheus data source. It assumes the collector's Prometheus exporter naming (`translation_strategy: UnderscoreEscapingWithSuffixes`) with resource attributes as labels — see [`otel-collector.yaml`](stack/otel-collector.yaml).
