// Token usage from Claude Code transcripts, attributed to agents and units of work.
//
// Claude Code writes one transcript per session (<project dir>/<session>.jsonl) and one
// per subagent (<project dir>/<session>/subagents/agent-<id>.jsonl, with a .meta.json
// naming its agent type and task description). Every model response in them carries
// its token usage. Transcripts are eventually cleaned up, so the hooks snapshot the
// totals into the stream's usage.jsonl, which is the durable record.
//
// Attribution: a lead names the work it's on by invoking the team-ops:start-work skill
// ("order-exceptions/round-2"); that call sits in its transcript with a timestamp, and
// the lead's own usage after it belongs to that work. A subagent belongs to the work
// in a "[TAG]" prefix on its task description, or else to the lead's work at the time
// it started.
import { readFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{input: number, output: number, cache_write_5m: number, cache_write_1h: number, cache_read: number, requests: number}} Tokens */
/** @typedef {{at: string, tag: string}} WorkTag */

const TOKEN_KEYS = ['input', 'output', 'cache_write_5m', 'cache_write_1h', 'cache_read'];

/** @returns {Tokens} */
const zero = () => ({ input: 0, output: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, requests: 0 });

/** @param {string} p @returns {any[]} parsed JSONL rows, skipping bad lines */
function readJsonl(p) {
  const rows = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* a partial last line while the file is being written */ }
  }
  return rows;
}

/**
 * Model responses in a transcript, one per API message. A response is written as one
 * line per content block, each repeating the same usage, so dedupe by message id.
 * @param {any[]} rows
 * @param {{mainOnly?: boolean}} [opts]
 * @returns {{at: string, model: string, speed: string, usage: any}[]}
 */
function responses(rows, opts = {}) {
  /** @type {Map<string, {at: string, model: string, speed: string, usage: any}>} */
  const byId = new Map();
  for (const r of rows) {
    if (r.type !== 'assistant' || (opts.mainOnly && r.isSidechain)) continue;
    const m = r.message;
    if (!m || !m.usage || !m.model || m.model === '<synthetic>') continue;
    byId.set(m.id || r.uuid, { at: r.timestamp, model: m.model, speed: m.usage.speed || 'standard', usage: m.usage });
  }
  return [...byId.values()];
}

/** @param {any} u @returns {Tokens} */
function tokensOf(u) {
  const cc = u.cache_creation || {};
  const w1h = cc.ephemeral_1h_input_tokens || 0;
  const w5m = cc.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  return {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cache_write_5m: w5m,
    cache_write_1h: w1h,
    cache_read: u.cache_read_input_tokens || 0,
    requests: 1,
  };
}

/** @param {Tokens} a @param {Tokens} b */
function add(a, b) {
  for (const k of [...TOKEN_KEYS, 'requests']) a[k] += b[k];
  return a;
}

/**
 * Work tags a lead set in this transcript, in order.
 * @param {any[]} rows
 * @returns {WorkTag[]}
 */
function workTags(rows) {
  /** @type {WorkTag[]} */
  const tags = [];
  for (const r of rows) {
    if (r.type !== 'assistant' || r.isSidechain) continue;
    for (const c of r.message?.content || []) {
      if (c?.type !== 'tool_use' || c.name !== 'Skill') continue;
      const skill = String(c.input?.skill || '');
      if (skill !== 'start-work' && !skill.endsWith(':start-work')) continue;
      const tag = String(c.input?.args || '').trim().split(/\s+/)[0];
      if (tag) tags.push({ at: r.timestamp, tag });
    }
  }
  return tags;
}

/**
 * The work in effect at a moment. Usage before the first tag belongs to the first tag:
 * a lead usually names the work a few turns in, once it knows the slug.
 * @param {WorkTag[]} tags @param {string} at
 * @returns {string | null}
 */
function tagAt(tags, at) {
  if (!tags.length) return null;
  let cur = tags[0].tag;
  for (const t of tags) if (t.at <= at) cur = t.tag;
  return cur;
}

/** @param {string} description @returns {string | null} the "[TAG]" prefix, if any */
function bracketTag(description) {
  const m = String(description || '').match(/^\s*\[([^\]\s]+)\]/);
  return m ? m[1] : null;
}

/**
 * Snapshots one session: the lead's own usage (if it's a team lead session) and every
 * subagent's, aggregated per agent, unit of work and model.
 * @param {{transcriptPath: string, sessionId: string, leadAgent?: string, onlyAgentId?: string}} p
 *   leadAgent: the session's agent type when it's a team lead ("design-team:product-lead");
 *   onlyAgentId: snapshot just this subagent (SubagentStop).
 * @returns {object[]} usage records, all sharing one `snap` timestamp
 */
export function snapshotSession({ transcriptPath, sessionId, leadAgent, onlyAgentId }) {
  const snap = new Date().toISOString();
  const isLead = String(leadAgent || '').includes(':');
  const mainRows = existsSync(transcriptPath) ? readJsonl(transcriptPath) : [];
  const tags = workTags(mainRows);
  /** @type {Map<string, object>} */
  const out = new Map();
  const put = (agentId, agent, work, parentWork, r) => {
    const key = [agentId, work, r.model, r.speed].join('|');
    if (!out.has(key)) {
      out.set(key, { snap, session: sessionId, agent_id: agentId, agent, work, parent_work: parentWork, model: r.model, speed: r.speed, ...zero(), first: r.at, last: r.at });
    }
    const rec = /** @type {any} */ (out.get(key));
    add(rec, tokensOf(r.usage));
    if (r.at < rec.first) rec.first = r.at;
    if (r.at > rec.last) rec.last = r.at;
  };

  if (isLead && !onlyAgentId) {
    for (const r of responses(mainRows, { mainOnly: true })) {
      const work = tagAt(tags, r.at);
      put('main', leadAgent, work, work, r);
    }
  }

  const subDir = join(dirname(transcriptPath), sessionId, 'subagents');
  if (existsSync(subDir)) {
    for (const f of readdirSync(subDir)) {
      const m = f.match(/^agent-(.+)\.jsonl$/);
      if (!m || (onlyAgentId && m[1] !== onlyAgentId)) continue;
      const metaPath = join(subDir, `agent-${m[1]}.meta.json`);
      let meta = {};
      try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { /* no metadata: type unknown */ }
      const agent = /** @type {any} */ (meta).agentType || 'unknown';
      // In a lead's session, everything it spawned is the team's cost — including
      // built-in helpers like Explore. Elsewhere, only team agents count.
      if (!isLead && !agent.includes(':')) continue;
      const rs = responses(readJsonl(join(subDir, f)));
      if (!rs.length) continue;
      const started = rs.reduce((a, r) => (r.at < a ? r.at : a), rs[0].at);
      const parentWork = tagAt(tags, started);
      const work = bracketTag(/** @type {any} */ (meta).description) || parentWork;
      for (const r of rs) put(m[1], agent, work, parentWork, r);
    }
  }
  return [...out.values()];
}

/** @param {string} streamDirPath @param {object[]} records */
export function appendUsage(streamDirPath, records) {
  if (!records.length) return;
  appendFileSync(join(streamDirPath, 'usage.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

/**
 * The current view of the usage log: for each session and agent, only the records
 * from its latest snapshot. Snapshots are cumulative, so older ones are superseded.
 * @param {string} streamDirPath
 * @returns {any[]}
 */
export function currentUsage(streamDirPath) {
  const p = join(streamDirPath, 'usage.jsonl');
  if (!existsSync(p)) return [];
  const rows = readJsonl(p);
  /** @type {Map<string, string>} */
  const latest = new Map();
  for (const r of rows) {
    const k = `${r.session}|${r.agent_id}`;
    if (!latest.has(k) || r.snap > /** @type {string} */ (latest.get(k))) latest.set(k, r.snap);
  }
  return rows.filter((r) => latest.get(`${r.session}|${r.agent_id}`) === r.snap);
}

let PRICES;
/** @returns {any} */
function prices() {
  if (!PRICES) PRICES = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'prices.json'), 'utf8'));
  return PRICES;
}

/**
 * API-equivalent cost of a usage record in USD, or null when the model isn't priced.
 * @param {any} r
 * @returns {number | null}
 */
export function costOf(r) {
  const { models, speed_multiplier: speedMult = {} } = prices();
  const id = String(r.model).replace(/\[.*\]$/, '');
  const key = Object.keys(models).filter((k) => id.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (!key) return null;
  const p = models[key];
  const mult = speedMult[r.speed] || 1;
  return TOKEN_KEYS.reduce((sum, k) => sum + ((r[k] || 0) * p[k]) / 1e6, 0) * mult;
}

/** @returns {string} the price table's date */
export const pricesAsOf = () => prices().as_of;

/**
 * Finds a session's transcript under ~/.claude/projects, for backfilling sessions
 * whose hooks never fired (a killed headless run, say).
 * @param {string} projectsDir @param {string} sessionId
 * @returns {string | null}
 */
export function findTranscript(projectsDir, sessionId) {
  if (!existsSync(projectsDir)) return null;
  for (const d of readdirSync(projectsDir)) {
    const p = join(projectsDir, d, `${sessionId}.jsonl`);
    if (existsSync(p)) return p;
  }
  return null;
}

export { readJsonl, basename, workTags, tagAt, bracketTag };
