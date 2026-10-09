// The fields every team-ops record shares, so events, friction and cost can be joined:
// the namespaced agent, the session, and the unit of work.
//
// Hooks don't name a subagent reliably (SubagentStop can report "main"), so the agent
// type comes from the subagent's .meta.json beside its transcript when there is one.
// Work is resolved the same way usage-lib attributes cost: a "[TAG]" prefix on the
// agent's task description, else the tag the lead set with team-ops:start-work.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { readJsonl, workTags, tagAt, bracketTag, findTranscript } from './usage-lib.mjs';

/** @typedef {{agent: string | null, agent_id: string | null, session: string | null, work: string | null, parent_work: string | null}} Context */

/** @param {string} p @returns {any} parsed JSON, or {} */
function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

/** @param {string} transcriptPath @param {string} sessionId @returns {string} */
const subagentsDir = (transcriptPath, sessionId) => join(dirname(transcriptPath), sessionId, 'subagents');

/**
 * A subagent's type from its metadata — cheap, so a hook can decide whether the event
 * is a team agent's before reading the whole session transcript.
 * @param {string | undefined} transcriptPath @param {string | undefined} sessionId @param {string | undefined} agentId
 * @returns {string | null}
 */
export function subagentType(transcriptPath, sessionId, agentId) {
  if (!transcriptPath || !sessionId || !agentId) return null;
  return readJson(join(subagentsDir(transcriptPath, sessionId), `agent-${agentId}.meta.json`)).agentType || null;
}

/**
 * The shared fields for a record about this session, and about one of its subagents
 * when agentId is given.
 * @param {{transcriptPath?: string, sessionId?: string, agentId?: string, agentType?: string, at?: string}} p
 *   agentType: what the hook or caller said, used when there's no metadata to read.
 * @returns {Context}
 */
export function resolveContext({ transcriptPath, sessionId, agentId, agentType, at }) {
  /** @type {Context} */
  const ctx = { agent: agentType || null, agent_id: agentId || null, session: sessionId || null, work: null, parent_work: null };
  if (!sessionId) return ctx;
  const t = transcriptPath && existsSync(transcriptPath) ? transcriptPath : findTranscript(join(homedir(), '.claude', 'projects'), sessionId);
  if (!t) return ctx;
  const rows = readJsonl(t);
  const lead = rows.find((r) => r.type === 'agent-setting')?.agentSetting;
  ctx.parent_work = tagAt(workTags(rows), at || new Date().toISOString());
  ctx.work = ctx.parent_work;
  if (agentId) {
    const meta = readJson(join(subagentsDir(t, sessionId), `agent-${agentId}.meta.json`));
    if (meta.agentType) ctx.agent = meta.agentType;
    ctx.work = bracketTag(meta.description) || ctx.parent_work;
  } else if (lead && (!ctx.agent || ctx.agent === 'main')) {
    ctx.agent = lead;
  }
  return ctx;
}

/**
 * Context for a record an agent writes itself (a friction report), where only the
 * session id and the agent's own short or namespaced name are known. Finds the agent
 * among the session's lead and subagents; with several instances of one type, the one
 * whose transcript was written most recently is the one running now.
 * @param {string | undefined} sessionId
 * @param {string} name e.g. "security-reviewer" or "design-team:security-reviewer"
 * @returns {Context}
 */
export function resolveSelf(sessionId, name) {
  const matches = (type) => type === name || String(type).endsWith(`:${name}`);
  if (!sessionId) return { agent: name, agent_id: null, session: null, work: null, parent_work: null };
  const t = findTranscript(join(homedir(), '.claude', 'projects'), sessionId);
  if (!t) return { agent: name, agent_id: null, session: sessionId, work: null, parent_work: null };
  const dir = subagentsDir(t, sessionId);
  let best = null;
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = f.match(/^agent-(.+)\.meta\.json$/);
      if (!m || !matches(readJson(join(dir, f)).agentType)) continue;
      const tr = join(dir, `agent-${m[1]}.jsonl`);
      const mtime = existsSync(tr) ? statSync(tr).mtimeMs : 0;
      if (!best || mtime > best.mtime) best = { id: m[1], mtime };
    }
  }
  if (best) return resolveContext({ transcriptPath: t, sessionId, agentId: best.id });
  const ctx = resolveContext({ transcriptPath: t, sessionId });
  // The lead itself, or an agent this session can't place: keep what it called itself.
  if (!ctx.agent || !matches(ctx.agent)) ctx.agent = name;
  return ctx;
}
