// Exports team-ops telemetry as OpenTelemetry, over OTLP/HTTP with a JSON body. Off
// unless TEAM_OPS_OTLP_ENDPOINT is set.
//
//   Metrics  team_ops.work.cost, team_ops.work.token.usage — cost per unit of work
//   Events   team_ops.<event> log records — hook events and friction reports
//
// Every metric point and event carries the same fields (FIELDS below), so a backend
// can join friction or tool failures to the cost of the same work. Claude Code's own
// metrics can't carry the unit of work; these add it, under separate names, so a
// dashboard never adds the two together.
//
// Claude Code doesn't pass OTEL_* variables to hooks, so this reads its own:
//   TEAM_OPS_OTLP_ENDPOINT             base URL (http://localhost:4318); a /v1/metrics or /v1/logs URL works too
//   TEAM_OPS_OTLP_HEADERS              "key=value,key2=value2", e.g. an Authorization header
//   TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES  "key=value,..." added to every export, e.g. team.id=platform
//   TEAM_OPS_OTLP_LOG_CONTENT          "1" to include free text in events: friction notes, agent
//                                      reports, error messages, commands. Off by default.
//
// Metric values are cumulative per session, so a resend is harmless and a failed
// export is made good by the session's next one. Events are sent once, best effort;
// the local JSONL files stay the complete record.
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentUsage, costOf } from './usage-lib.mjs';

const TOKEN_TYPES = /** @type {const} */ ([
  ['input', ['input']],
  ['output', ['output']],
  ['cacheRead', ['cache_read']],
  ['cacheCreation', ['cache_write_5m', 'cache_write_1h']],
]);

/** @param {string | undefined} s @returns {Record<string, string>} parsed "k=v,k2=v2" */
function parsePairs(s) {
  /** @type {Record<string, string>} */
  const o = {};
  for (const part of String(s || '').split(',')) {
    const i = part.indexOf('=');
    if (i > 0) o[decode(part.slice(0, i).trim())] = decode(part.slice(i + 1).trim());
  }
  return o;
}

/** @param {string} s @returns {string} percent-decoded, as OTEL_* header values are; unchanged if malformed */
function decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** @param {'metrics' | 'logs'} signal @returns {string | null} the signal's URL, or null when export is off */
export function signalUrl(signal) {
  const e = String(process.env.TEAM_OPS_OTLP_ENDPOINT || '').trim().replace(/\/+$/, '').replace(/\/v1\/(metrics|logs)$/, '');
  return e ? `${e}/v1/${signal}` : null;
}

/** @returns {boolean} whether events may carry free text */
export const logContent = () => process.env.TEAM_OPS_OTLP_LOG_CONTENT === '1';

/** @param {Record<string, any>} o */
const attrs = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, v]) => ({ key, value: typeof v === 'number' ? { intValue: String(v) } : { stringValue: String(v) } }));

/** @param {string} iso @returns {string} nanoseconds since the epoch */
const nanos = (iso) => `${BigInt(Date.parse(iso)) * 1000000n}`;

/**
 * The shared fields, as OTel attributes. Session is a resource attribute.
 * @param {{stream: string, agent?: string, agent_id?: string, work?: string | null, parent_work?: string | null}} r
 */
const FIELDS = (r) => ({ 'team_ops.stream': r.stream, agent: r.agent, 'agent.id': r.agent_id, work: r.work || '(untagged)', parent_work: r.parent_work || '' });

/** @param {string} session */
const resource = (session) => ({ attributes: attrs({ 'service.name': 'team-ops', 'service.instance.id': session, 'session.id': session, ...parsePairs(process.env.TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES) }) });

/**
 * Builds the OTLP metrics request for one session's current usage, aggregated per
 * agent type, unit of work, model and speed.
 * @param {any[]} rows the session's current usage records
 * @param {{session: string, stream: string}} ctx
 * @returns {object | null}
 */
export function buildMetrics(rows, { session, stream }) {
  if (!rows.length) return null;
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const r of rows) {
    const k = [r.agent, r.work, r.parent_work, r.model, r.speed].join('|');
    if (!groups.has(k)) groups.set(k, { agent: r.agent, work: r.work, parent_work: r.parent_work, model: r.model, speed: r.speed, cost: 0, tokens: {} });
    const g = groups.get(k);
    g.cost += costOf(r) || 0;
    for (const [type, keys] of TOKEN_TYPES) g.tokens[type] = (g.tokens[type] || 0) + keys.reduce((s, key) => s + (r[key] || 0), 0);
  }
  const start = nanos(rows.reduce((a, r) => (r.first < a ? r.first : a), rows[0].first));
  const now = `${BigInt(Date.now()) * 1000000n}`;
  // Metric points aggregate across instances of an agent type, so no agent.id.
  const base = (g) => ({ ...FIELDS({ stream, agent: g.agent, work: g.work, parent_work: g.parent_work }), model: g.model, speed: g.speed });
  const cost = [];
  const tokens = [];
  for (const g of groups.values()) {
    cost.push({ attributes: attrs(base(g)), startTimeUnixNano: start, timeUnixNano: now, asDouble: Number(g.cost.toFixed(6)) });
    for (const [type] of TOKEN_TYPES) {
      tokens.push({ attributes: attrs({ ...base(g), type }), startTimeUnixNano: start, timeUnixNano: now, asInt: String(g.tokens[type]) });
    }
  }
  const sum = (points) => ({ dataPoints: points, aggregationTemporality: 2, isMonotonic: true });
  return {
    resourceMetrics: [{
      resource: resource(session),
      scopeMetrics: [{
        scope: { name: 'team-ops' },
        metrics: [
          { name: 'team_ops.work.cost', unit: 'USD', description: 'API-equivalent cost at list prices, per unit of work', sum: sum(cost) },
          { name: 'team_ops.work.token.usage', unit: 'tokens', description: 'Tokens used, per unit of work', sum: sum(tokens) },
        ],
      }],
    }],
  };
}

// Hook events, by the name they're exported under.
const EVENT_NAMES = {
  PostToolUseFailure: 'tool_failure',
  PermissionDenied: 'permission_denied',
  SubagentStart: 'agent_start',
  SubagentStop: 'agent_stop',
  PreCompact: 'compaction',
  TaskCreated: 'task_created',
  TaskCompleted: 'task_completed',
  StopFailure: 'stop_failure',
  SessionEnd: 'session_end',
};
const WARN = new Set(['tool_failure', 'permission_denied', 'stop_failure', 'friction']);

/** @param {string} type a hook event name, or "friction" @returns {string} e.g. "team_ops.tool_failure" */
export const eventName = (type) => `team_ops.${EVENT_NAMES[type] || type}`;

/**
 * Builds the OTLP logs request for one local record — an events.jsonl or friction.jsonl
 * row. Free text goes in only when TEAM_OPS_OTLP_LOG_CONTENT=1.
 * @param {any} rec the local record
 * @param {'event' | 'friction'} kind which file it came from
 * @param {string} stream
 * @returns {object}
 */
export function buildEvent(rec, kind, stream) {
  const name = eventName(kind === 'friction' ? 'friction' : rec.event);
  const content = logContent();
  const a = {
    'event.name': name,
    ...FIELDS({ stream, agent: rec.agent, agent_id: rec.agent_id, work: rec.work, parent_work: rec.parent_work }),
    'hook.event': rec.event,
    'tool.name': rec.tool,
    'permission.mode': rec.mode,
    effort: rec.effort,
    'friction.kind': rec.kind,
  };
  let body;
  if (content) {
    Object.assign(a, { 'tool.target': rec.target, 'error.message': rec.error, reason: rec.reason, 'task.description': rec.task });
    body = rec.note || rec.report || rec.error;
  }
  const short = name.slice('team_ops.'.length);
  const record = {
    timeUnixNano: nanos(rec.ts),
    observedTimeUnixNano: `${BigInt(Date.now()) * 1000000n}`,
    severityNumber: WARN.has(short) ? 13 : 9,
    severityText: WARN.has(short) ? 'WARN' : 'INFO',
    eventName: name,
    attributes: attrs(a),
    ...(body ? { body: { stringValue: String(body) } } : {}),
  };
  return { resourceLogs: [{ resource: resource(rec.session || 'unknown'), scopeLogs: [{ scope: { name: 'team-ops' }, logRecords: [record] }] }] };
}

/**
 * POSTs one OTLP request. Never throws.
 * @param {'metrics' | 'logs'} signal @param {object} body @param {number} timeoutMs
 * @returns {Promise<string | null>} an error, or null on success
 */
async function post(signal, body, timeoutMs) {
  try {
    const res = await fetch(/** @type {string} */ (signalUrl(signal)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...parsePairs(process.env.TEAM_OPS_OTLP_HEADERS) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? null : `HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`;
  } catch (e) {
    return String(/** @type {any} */ (e)?.cause?.code || /** @type {any} */ (e)?.name || e);
  }
}

/**
 * Records the outcome of an export in otlp-status.json, per signal, for troubleshooting.
 * @param {string} dir @param {'metrics' | 'logs'} signal @param {number} sent @param {string | null | undefined} error
 */
function status(dir, signal, sent, error) {
  try {
    const p = join(dir, 'otlp-status.json');
    let s = {};
    try { s = JSON.parse(readFileSync(p, 'utf8')); } catch { /* first export */ }
    s[signal] = { at: new Date().toISOString(), url: signalUrl(signal), sent, ok: !error, error: error || null };
    writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
  } catch { /* status is a convenience */ }
}

/**
 * Exports the current usage of the given sessions as metrics.
 * @param {string} dir stream directory
 * @param {string} stream stream name
 * @param {Iterable<string>} sessions
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{exported: number, error?: string} | null>} null when export is off
 */
export async function exportSessions(dir, stream, sessions, opts = {}) {
  if (!signalUrl('metrics')) return null;
  const want = new Set(sessions);
  const bySession = new Map();
  for (const r of currentUsage(dir)) {
    if (!want.has(r.session)) continue;
    if (!bySession.has(r.session)) bySession.set(r.session, []);
    bySession.get(r.session).push(r);
  }
  let exported = 0;
  let error;
  for (const [session, rows] of bySession) {
    const body = buildMetrics(rows, { session, stream });
    if (!body) continue;
    error = await post('metrics', body, opts.timeoutMs ?? 2000);
    if (error) break;
    exported++;
  }
  status(dir, 'metrics', exported, error);
  return { exported, error: error || undefined };
}

/**
 * Exports one local record as an event. Best effort: a failure is noted in
 * otlp-status.json and the record stays in the local file.
 * @param {string} dir stream directory @param {string} stream
 * @param {any} rec @param {'event' | 'friction'} kind
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<string | null | undefined>} undefined when export is off, else the error or null
 */
export async function exportEvent(dir, stream, rec, kind, opts = {}) {
  if (!signalUrl('logs')) return undefined;
  const error = await post('logs', buildEvent(rec, kind, stream), opts.timeoutMs ?? 1500);
  status(dir, 'logs', error ? 0 : 1, error);
  return error;
}
