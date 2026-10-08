// Exports cost and tokens per unit of work as OpenTelemetry metrics, over OTLP/HTTP
// with a JSON body. Off unless TEAM_OPS_OTLP_ENDPOINT is set.
//
// Claude Code's own metrics already carry cost per user, model and agent; what they
// can't carry is the unit of work. These add it. They're separate metric names, so a
// dashboard never adds the two together.
//
// Claude Code doesn't pass OTEL_* variables to hooks, so this reads its own:
//   TEAM_OPS_OTLP_ENDPOINT             base URL (http://localhost:4318) or the full /v1/metrics URL
//   TEAM_OPS_OTLP_HEADERS              "key=value,key2=value2", e.g. an Authorization header
//   TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES  "key=value,..." added to every export, e.g. team.id=platform
//
// Values are cumulative per session, so a resend is harmless and a failed export is
// made good by the session's next one: every export sends the session's whole
// current usage, not what changed.
import { writeFileSync } from 'node:fs';
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

/** @returns {string | null} the metrics URL, or null when export is off */
export function metricsUrl() {
  const e = String(process.env.TEAM_OPS_OTLP_ENDPOINT || '').trim().replace(/\/+$/, '');
  if (!e) return null;
  return e.endsWith('/v1/metrics') ? e : `${e}/v1/metrics`;
}

/** @param {Record<string, string>} o */
const attrs = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([key, v]) => ({ key, value: { stringValue: String(v) } }));

/** @param {string} iso @returns {string} nanoseconds since the epoch */
const nanos = (iso) => `${BigInt(Date.parse(iso)) * 1000000n}`;

/**
 * Builds the OTLP request for one session's current usage, aggregated per agent type,
 * unit of work, model and speed.
 * @param {any[]} rows the session's current usage records
 * @param {{session: string, stream: string}} ctx
 * @returns {object | null}
 */
export function buildRequest(rows, { session, stream }) {
  if (!rows.length) return null;
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const r of rows) {
    const k = [r.agent, r.work, r.parent_work, r.model, r.speed].join('|');
    if (!groups.has(k)) groups.set(k, { agent: r.agent, work: r.work, parent_work: r.parent_work, model: r.model, speed: r.speed, cost: 0, tokens: {}, first: r.first });
    const g = groups.get(k);
    g.cost += costOf(r) || 0;
    for (const [type, keys] of TOKEN_TYPES) g.tokens[type] = (g.tokens[type] || 0) + keys.reduce((s, key) => s + (r[key] || 0), 0);
    if (r.first < g.first) g.first = r.first;
  }
  const start = nanos(rows.reduce((a, r) => (r.first < a ? r.first : a), rows[0].first));
  const now = `${BigInt(Date.now()) * 1000000n}`;
  const base = (g) => ({ 'team_ops.stream': stream, agent: g.agent, work: g.work || '(untagged)', parent_work: g.parent_work || '', model: g.model, speed: g.speed });
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
      resource: { attributes: attrs({ 'service.name': 'team-ops', 'service.instance.id': session, 'session.id': session, ...parsePairs(process.env.TEAM_OPS_OTLP_RESOURCE_ATTRIBUTES) }) },
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

/**
 * Exports the current usage of the given sessions. Never throws; the outcome is
 * written to otlp-status.json in the stream directory for troubleshooting.
 * @param {string} dir stream directory
 * @param {string} stream stream name
 * @param {Iterable<string>} sessions
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{exported: number, error?: string} | null>} null when export is off
 */
export async function exportSessions(dir, stream, sessions, opts = {}) {
  const url = metricsUrl();
  if (!url) return null;
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
    const body = buildRequest(rows, { session, stream });
    if (!body) continue;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...parsePairs(process.env.TEAM_OPS_OTLP_HEADERS) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
      });
      if (res.ok) exported++;
      else { error = `HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`; break; }
    } catch (e) {
      error = String(/** @type {any} */ (e)?.cause?.code || /** @type {any} */ (e)?.name || e);
      break;
    }
  }
  try {
    writeFileSync(join(dir, 'otlp-status.json'), JSON.stringify({ at: new Date().toISOString(), url, exported, ok: !error, error: error || null }, null, 2) + '\n');
  } catch { /* status is a convenience */ }
  return { exported, error };
}
