// Every team-ops record (event, friction report, cost row) carries the same three
// fields: the full agent name, the session, and the unit of work. They are what let the
// coach join friction to cost, so a wrong value here corrupts every report downstream.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, writeSession, assistant, startWork, usage, ts } from './helpers.mjs';
import { subagentType, resolveContext, resolveSelf } from '../plugins/team-ops/scripts/context.mjs';

// context.mjs looks for transcripts under os.homedir(), which follows HOME / USERPROFILE.
const saved = {};
beforeEach(() => {
  for (const k of ['HOME', 'USERPROFILE']) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ['HOME', 'USERPROFILE']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const useHome = (sb) => Object.assign(process.env, sb.env);

/** A tech-lead session working two tickets, with two ICs and a reviewer. */
function session(sb) {
  return writeSession({
    home: sb.home,
    sessionId: 'sess-1',
    lead: 'engineering-team:tech-lead',
    rows: [startWork(1, 'CLOUD-1'), startWork(100, 'CLOUD-2')],
    subagents: [
      { id: 'ic-a', agentType: 'engineering-team:ic-generalist', description: '[CLOUD-1] implement retry', rows: [assistant({ at: 10, usage: usage({}), sidechain: true })] },
      { id: 'ic-b', agentType: 'engineering-team:ic-generalist', description: '[CLOUD-2] implement backoff', rows: [assistant({ at: 110, usage: usage({}), sidechain: true })] },
      { id: 'rev', agentType: 'engineering-team:code-reviewer', description: 'review the PR', rows: [assistant({ at: 120, usage: usage({}), sidechain: true })] },
    ],
  });
}

describe('subagentType', () => {
  test("reads a subagent's type from its metadata", (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = session(sb);
    assert.equal(subagentType(transcriptPath, 'sess-1', 'rev'), 'engineering-team:code-reviewer');
  });

  test('is null when there is no metadata or the hook gave too little to look it up', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = session(sb);
    assert.equal(subagentType(transcriptPath, 'sess-1', 'nobody'), null);
    assert.equal(subagentType(undefined, 'sess-1', 'rev'), null);
    assert.equal(subagentType(transcriptPath, undefined, 'rev'), null);
    assert.equal(subagentType(transcriptPath, 'sess-1', undefined), null);
  });
});

describe('resolveContext', () => {
  test('a subagent gets its full name and the work in its own [TAG]', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    const { transcriptPath } = session(sb);
    const ctx = resolveContext({ transcriptPath, sessionId: 'sess-1', agentId: 'ic-a', agentType: 'main', at: ts(10) });
    assert.equal(ctx.agent, 'engineering-team:ic-generalist');
    assert.equal(ctx.work, 'CLOUD-1');
    assert.equal(ctx.session, 'sess-1');
    assert.equal(ctx.agent_id, 'ic-a');
  });

  test("an untagged subagent falls back to the lead's work at that moment", (t) => {
    const sb = sandbox(t);
    useHome(sb);
    const { transcriptPath } = session(sb);
    const early = resolveContext({ transcriptPath, sessionId: 'sess-1', agentId: 'rev', at: ts(50) });
    const late = resolveContext({ transcriptPath, sessionId: 'sess-1', agentId: 'rev', at: ts(120) });
    assert.equal(early.work, 'CLOUD-1');
    assert.equal(late.work, 'CLOUD-2');
    assert.equal(late.parent_work, 'CLOUD-2');
  });

  test('the lead itself is named from the session, and works under its latest tag', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    const { transcriptPath } = session(sb);
    // SubagentStop can report the lead as "main"; the transcript knows better.
    const ctx = resolveContext({ transcriptPath, sessionId: 'sess-1', agentType: 'main', at: ts(150) });
    assert.equal(ctx.agent, 'engineering-team:tech-lead');
    assert.equal(ctx.work, 'CLOUD-2');
  });

  test('without a session there is nothing to resolve, and nothing is invented', () => {
    const ctx = resolveContext({ agentType: 'engineering-team:ic-generalist' });
    assert.deepEqual(ctx, { agent: 'engineering-team:ic-generalist', agent_id: null, session: null, work: null, parent_work: null });
  });

  test("a session whose transcript is gone keeps what the hook said", (t) => {
    const sb = sandbox(t);
    useHome(sb);
    const ctx = resolveContext({ sessionId: 'cleaned-up', agentId: 'x', agentType: 'design-team:architect' });
    assert.equal(ctx.agent, 'design-team:architect');
    assert.equal(ctx.work, null);
  });

  test('finds the transcript by session id when the hook did not pass its path', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    session(sb);
    const ctx = resolveContext({ sessionId: 'sess-1', agentId: 'ic-b', at: ts(110) });
    assert.equal(ctx.work, 'CLOUD-2');
  });
});

describe('resolveSelf: an agent reporting about itself knows only a short name and the session id', () => {
  test('finds the subagent of that type, and its work', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    session(sb);
    const ctx = resolveSelf('sess-1', 'code-reviewer');
    assert.equal(ctx.agent, 'engineering-team:code-reviewer');
    assert.equal(ctx.agent_id, 'rev');
  });

  test('accepts the namespaced name too', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    session(sb);
    assert.equal(resolveSelf('sess-1', 'engineering-team:code-reviewer').agent_id, 'rev');
  });

  test('with several instances of a type, the one written most recently is the one running', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    const { subagentsDir } = session(sb);
    // ic-a finished long ago; ic-b is active now.
    utimesSync(join(subagentsDir, 'agent-ic-a.jsonl'), new Date('2026-01-01'), new Date('2026-01-01'));
    utimesSync(join(subagentsDir, 'agent-ic-b.jsonl'), new Date('2026-10-12'), new Date('2026-10-12'));
    const ctx = resolveSelf('sess-1', 'ic-generalist');
    assert.equal(ctx.agent_id, 'ic-b');
    assert.equal(ctx.work, 'CLOUD-2');
  });

  test('a lead reporting on itself is not mistaken for a subagent', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    session(sb);
    const ctx = resolveSelf('sess-1', 'tech-lead');
    assert.equal(ctx.agent, 'engineering-team:tech-lead');
    assert.equal(ctx.agent_id, null);
  });

  test('an unknown session degrades to the name it was given', (t) => {
    const sb = sandbox(t);
    useHome(sb);
    assert.deepEqual(resolveSelf('no-such-session', 'architect'), { agent: 'architect', agent_id: null, session: 'no-such-session', work: null, parent_work: null });
    assert.deepEqual(resolveSelf(undefined, 'architect'), { agent: 'architect', agent_id: null, session: null, work: null, parent_work: null });
  });
});
