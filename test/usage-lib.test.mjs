// Cost accounting reads Claude Code's transcripts and turns them into per-agent,
// per-unit-of-work token counts and dollars. The failure modes that matter are silent
// ones: counting a response twice, attributing a ticket's spend to the wrong work,
// pricing a model at its neighbor's rate. Each test builds a transcript the way Claude
// Code writes one and checks the numbers by hand.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, writeSession, assistant, startWork, usage, ts, readJsonl as readJsonlFile } from './helpers.mjs';
import {
  snapshotSession, appendUsage, currentUsage, costOf, pricesAsOf, findTranscript,
  workTags, tagAt, bracketTag,
} from '../plugins/team-ops/scripts/usage-lib.mjs';

const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5-5';

/** Sums a field over the snapshot records matching a filter. */
const sum = (records, where, field) => records.filter(where).reduce((s, r) => s + r[field], 0);

describe('a lead session', () => {
  /** A product-lead session across two decision rounds, with one subagent. */
  function leadSession(sb) {
    return writeSession({
      home: sb.home,
      sessionId: 's-lead',
      lead: 'design-team:product-lead',
      rows: [
        assistant({ at: 1, usage: usage({ input: 1000, output: 100 }) }), // before the lead names its work
        startWork(2, 'order-exceptions/round-1'),
        assistant({ at: 3, usage: usage({ input: 2000, output: 200 }) }),
        startWork(10, 'order-exceptions/round-2'),
        assistant({ at: 11, usage: usage({ output: 500 }) }),
      ],
      subagents: [
        {
          id: 'a1',
          agentType: 'design-team:architect',
          description: '[order-exceptions/arch] draft architecture.md',
          rows: [assistant({ at: 4, usage: usage({ input: 5000, output: 800 }), sidechain: true })],
        },
      ],
    });
  }

  test("attributes the lead's usage to the work it had named at the time", (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = leadSession(sb);
    const recs = snapshotSession({ transcriptPath, sessionId: 's-lead', leadAgent: 'design-team:product-lead' });
    const lead = (w) => (r) => r.agent_id === 'main' && r.work === w;
    // 100 (before the first tag, so it joins the first round) + 1 (the tagging call itself) + 200.
    assert.equal(sum(recs, lead('order-exceptions/round-1'), 'output'), 301);
    assert.equal(sum(recs, lead('order-exceptions/round-2'), 'output'), 501);
    assert.equal(recs.filter((r) => r.agent_id === 'main').every((r) => r.agent === 'design-team:product-lead'), true);
  });

  test("a subagent's own [TAG] wins over the lead's current work, which is kept as parent_work", (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = leadSession(sb);
    const recs = snapshotSession({ transcriptPath, sessionId: 's-lead', leadAgent: 'design-team:product-lead' });
    const arch = recs.find((r) => r.agent === 'design-team:architect');
    assert.equal(arch.work, 'order-exceptions/arch');
    assert.equal(arch.parent_work, 'order-exceptions/round-1');
    assert.equal(arch.input, 5000);
    assert.equal(arch.output, 800);
  });

  test('a subagent with no tag inherits the lead\'s work at the moment it started', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 's2',
      lead: 'engineering-team:tech-lead',
      rows: [startWork(1, 'CLOUD-1'), startWork(20, 'CLOUD-2')],
      subagents: [
        { id: 'early', agentType: 'engineering-team:ic-generalist', description: 'implement retry', rows: [assistant({ at: 5, usage: usage({ output: 10 }), sidechain: true })] },
        { id: 'late', agentType: 'engineering-team:ic-generalist', description: 'implement backoff', rows: [assistant({ at: 25, usage: usage({ output: 20 }), sidechain: true })] },
      ],
    });
    const recs = snapshotSession({ transcriptPath, sessionId: 's2', leadAgent: 'engineering-team:tech-lead' });
    assert.equal(recs.find((r) => r.agent_id === 'early').work, 'CLOUD-1');
    assert.equal(recs.find((r) => r.agent_id === 'late').work, 'CLOUD-2');
  });

  test('includes built-in helpers the lead spawned, such as Explore', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 's3',
      lead: 'design-team:product-lead',
      rows: [startWork(1, 'pkg/round-1')],
      subagents: [{ id: 'x', agentType: 'Explore', rows: [assistant({ at: 2, usage: usage({ output: 7 }), sidechain: true })] }],
    });
    const recs = snapshotSession({ transcriptPath, sessionId: 's3', leadAgent: 'design-team:product-lead' });
    assert.equal(sum(recs, (r) => r.agent === 'Explore', 'output'), 7);
  });

  test('every record in one snapshot shares one snap timestamp', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = leadSession(sb);
    const recs = snapshotSession({ transcriptPath, sessionId: 's-lead', leadAgent: 'design-team:product-lead' });
    assert.ok(recs.length >= 3);
    assert.equal(new Set(recs.map((r) => r.snap)).size, 1);
  });
});

describe('what counts as usage', () => {
  test('a response written as several content blocks is counted once', (t) => {
    // Claude Code writes one transcript line per content block, each repeating the
    // response's usage. Summing lines would double-count every tool-using turn.
    const sb = sandbox(t);
    const u = usage({ input: 1000, output: 400 });
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 'dup',
      lead: 'engineering-team:tech-lead',
      rows: [
        assistant({ at: 1, id: 'msg_same', usage: u, content: [{ type: 'text', text: 'thinking' }] }),
        assistant({ at: 1, id: 'msg_same', usage: u, content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] }),
        assistant({ at: 2, id: 'msg_next', usage: u }),
      ],
    });
    const recs = snapshotSession({ transcriptPath, sessionId: 'dup', leadAgent: 'engineering-team:tech-lead' });
    assert.equal(sum(recs, () => true, 'requests'), 2);
    assert.equal(sum(recs, () => true, 'output'), 800);
  });

  test("the lead's usage excludes sidechain rows, which belong to subagents", (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 'side',
      lead: 'engineering-team:tech-lead',
      rows: [assistant({ at: 1, usage: usage({ output: 10 }) }), assistant({ at: 2, usage: usage({ output: 999 }), sidechain: true })],
    });
    const recs = snapshotSession({ transcriptPath, sessionId: 'side', leadAgent: 'engineering-team:tech-lead' });
    assert.equal(sum(recs, (r) => r.agent_id === 'main', 'output'), 10);
  });

  test('splits cache writes by lifetime, and reads from cache separately', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 'cache',
      lead: 'engineering-team:tech-lead',
      rows: [assistant({ at: 1, usage: usage({ input: 10, write5m: 300, write1h: 200, read: 9000 }) })],
    });
    const [r] = snapshotSession({ transcriptPath, sessionId: 'cache', leadAgent: 'engineering-team:tech-lead' });
    assert.deepEqual([r.input, r.cache_write_5m, r.cache_write_1h, r.cache_read], [10, 300, 200, 9000]);
  });

  test('older transcripts with only a total cache-creation count are treated as 5-minute writes', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 'legacy',
      lead: 'engineering-team:tech-lead',
      rows: [assistant({ at: 1, usage: { input_tokens: 5, output_tokens: 5, cache_creation_input_tokens: 400, cache_read_input_tokens: 0 } })],
    });
    const [r] = snapshotSession({ transcriptPath, sessionId: 'legacy', leadAgent: 'engineering-team:tech-lead' });
    assert.equal(r.cache_write_5m, 400);
    assert.equal(r.cache_write_1h, 0);
  });

  test('keeps different models and fast mode apart, since they price differently', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 'models',
      lead: 'engineering-team:tech-lead',
      rows: [
        assistant({ at: 1, usage: usage({ output: 10 }), model: OPUS }),
        assistant({ at: 2, usage: usage({ output: 20 }), model: SONNET }),
        assistant({ at: 3, usage: usage({ output: 30, speed: 'fast' }), model: OPUS }),
      ],
    });
    const recs = snapshotSession({ transcriptPath, sessionId: 'models', leadAgent: 'engineering-team:tech-lead' });
    assert.equal(recs.length, 3);
    assert.equal(recs.find((r) => r.speed === 'fast').output, 30);
  });

  test('ignores synthetic and usage-less rows', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 'synthetic',
      lead: 'engineering-team:tech-lead',
      rows: [
        assistant({ at: 1, usage: usage({ output: 50 }), model: '<synthetic>' }),
        { type: 'user', timestamp: ts(2), message: { role: 'user', content: 'hi' } },
        assistant({ at: 3, usage: usage({ output: 5 }) }),
      ],
    });
    const recs = snapshotSession({ transcriptPath, sessionId: 'synthetic', leadAgent: 'engineering-team:tech-lead' });
    assert.equal(sum(recs, () => true, 'output'), 5);
  });

  test('a transcript still being written (a partial last line) is read up to the break', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({ home: sb.home, sessionId: 'live', lead: 'engineering-team:tech-lead', rows: [assistant({ at: 1, usage: usage({ output: 9 }) })] });
    writeFileSync(transcriptPath, readFileSync(transcriptPath, 'utf8') + '{"type":"assistant","message":{"id":"half');
    const recs = snapshotSession({ transcriptPath, sessionId: 'live', leadAgent: 'engineering-team:tech-lead' });
    assert.equal(sum(recs, () => true, 'output'), 9);
  });
});

describe('sessions that are not a team lead', () => {
  /** An ordinary session that happened to dispatch a team agent and a built-in helper. */
  function plainSession(sb) {
    return writeSession({
      home: sb.home,
      sessionId: 'plain',
      rows: [assistant({ at: 1, usage: usage({ output: 1000 }) })],
      subagents: [
        { id: 'ic', agentType: 'engineering-team:ic-generalist', description: '[CLOUD-5] fix', rows: [assistant({ at: 2, usage: usage({ output: 40 }), sidechain: true })] },
        { id: 'ex', agentType: 'Explore', rows: [assistant({ at: 2, usage: usage({ output: 60 }), sidechain: true })] },
      ],
    });
  }

  test("counts team agents but neither the session's own usage nor built-in helpers", (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = plainSession(sb);
    const recs = snapshotSession({ transcriptPath, sessionId: 'plain' });
    assert.deepEqual(recs.map((r) => r.agent), ['engineering-team:ic-generalist']);
    assert.equal(recs[0].work, 'CLOUD-5');
  });

  test('onlyAgentId snapshots just that subagent, for the SubagentStop hook', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 'two',
      lead: 'engineering-team:tech-lead',
      rows: [assistant({ at: 1, usage: usage({ output: 100 }) })],
      subagents: [
        { id: 'one', agentType: 'engineering-team:ic-generalist', rows: [assistant({ at: 2, usage: usage({ output: 1 }), sidechain: true })] },
        { id: 'two', agentType: 'engineering-team:qa-specialist', rows: [assistant({ at: 3, usage: usage({ output: 2 }), sidechain: true })] },
      ],
    });
    const recs = snapshotSession({ transcriptPath, sessionId: 'two', leadAgent: 'engineering-team:tech-lead', onlyAgentId: 'two' });
    assert.deepEqual(recs.map((r) => r.agent_id), ['two']);
  });

  test('a missing transcript yields no records instead of an error', () => {
    assert.deepEqual(snapshotSession({ transcriptPath: join('no', 'such', 'file.jsonl'), sessionId: 'ghost', leadAgent: 'engineering-team:tech-lead' }), []);
  });
});

describe('work tags', () => {
  test('workTags reads start-work calls in order, namespaced or bare, ignoring other skills and sidechains', () => {
    const skill = (at, skillName, args, sidechain = false) =>
      assistant({ at, usage: usage({}), sidechain, content: [{ type: 'tool_use', id: `t${at}`, name: 'Skill', input: { skill: skillName, args } }] });
    const tags = workTags([
      skill(1, 'team-ops:start-work', 'pkg/round-1'),
      skill(2, 'team-ops:log-friction', 'ignored'),
      skill(3, 'start-work', 'pkg/round-2 starting the security round'),
      skill(4, 'team-ops:start-work', 'sidechain/ignored', true),
      skill(5, 'team-ops:start-work', ''),
    ]);
    assert.deepEqual(tags.map((t) => t.tag), ['pkg/round-1', 'pkg/round-2']);
  });

  test('tagAt: usage before the first tag belongs to the first tag; later usage to the latest in effect', () => {
    const tags = [{ at: ts(10), tag: 'A' }, { at: ts(20), tag: 'B' }];
    assert.equal(tagAt(tags, ts(1)), 'A');
    assert.equal(tagAt(tags, ts(10)), 'A');
    assert.equal(tagAt(tags, ts(19)), 'A');
    assert.equal(tagAt(tags, ts(20)), 'B');
    assert.equal(tagAt(tags, ts(999)), 'B');
    assert.equal(tagAt([], ts(1)), null);
  });

  test('bracketTag takes only a leading [TAG]', () => {
    assert.equal(bracketTag('[CLOUD-123] implement retry'), 'CLOUD-123');
    assert.equal(bracketTag('  [order-exceptions/phase-1] build it'), 'order-exceptions/phase-1');
    assert.equal(bracketTag('implement [CLOUD-123] retry'), null);
    assert.equal(bracketTag('[two words] nope'), null);
    assert.equal(bracketTag(''), null);
    assert.equal(bracketTag(undefined), null);
  });
});

describe('the current view of the usage log', () => {
  const rec = (over) => ({ session: 's1', agent_id: 'main', agent: 'x:lead', work: 'w', model: OPUS, speed: 'standard', input: 0, output: 1, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, requests: 1, first: ts(1), last: ts(2), ...over });

  test('a later snapshot supersedes an earlier one for the same session and agent', (t) => {
    const sb = sandbox(t);
    appendUsage(sb.home, [rec({ snap: '2026-10-12T10:00:00Z', output: 100 })]);
    appendUsage(sb.home, [rec({ snap: '2026-10-12T11:00:00Z', output: 250 })]);
    const now = currentUsage(sb.home);
    assert.equal(now.length, 1);
    assert.equal(now[0].output, 250);
  });

  test('every record of the latest snapshot is kept, across models and work', (t) => {
    const sb = sandbox(t);
    appendUsage(sb.home, [rec({ snap: 'S1', work: 'a', output: 1 }), rec({ snap: 'S1', work: 'b', output: 2 })]);
    appendUsage(sb.home, [rec({ snap: 'S2', work: 'a', output: 10 }), rec({ snap: 'S2', work: 'b', output: 20 })]);
    assert.deepEqual(currentUsage(sb.home).map((r) => r.output).sort((x, y) => x - y), [10, 20]);
  });

  test('agents and sessions are superseded independently', (t) => {
    const sb = sandbox(t);
    appendUsage(sb.home, [rec({ snap: 'S1', agent_id: 'main', output: 1 }), rec({ snap: 'S1', agent_id: 'sub', output: 2 })]);
    appendUsage(sb.home, [rec({ snap: 'S2', agent_id: 'main', output: 10 })]); // sub has no newer snapshot
    appendUsage(sb.home, [rec({ snap: 'S1', session: 's2', output: 5 })]);
    const now = currentUsage(sb.home);
    assert.deepEqual(now.map((r) => `${r.session}/${r.agent_id}=${r.output}`).sort(), ['s1/main=10', 's1/sub=2', 's2/main=5']);
  });

  test('an empty or missing log is empty', (t) => {
    const sb = sandbox(t);
    assert.deepEqual(currentUsage(sb.home), []);
    appendUsage(sb.home, []);
    assert.deepEqual(currentUsage(sb.home), []);
  });

  test('appendUsage writes one JSON object per line', (t) => {
    const sb = sandbox(t);
    appendUsage(sb.home, [rec({ snap: 'S1' }), rec({ snap: 'S1', work: 'other' })]);
    assert.equal(readJsonlFile(join(sb.home, 'usage.jsonl')).length, 2);
  });
});

describe('pricing', () => {
  const million = (over) => ({ model: OPUS, speed: 'standard', input: 0, output: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, ...over });

  test('prices every token class at its own rate', () => {
    // opus-5-5 per million: input 4, output 20, 5m write 5, 1h write 8, read 0.2
    assert.equal(costOf(million({ input: 1e6, output: 1e5 })), 4 + 2);
    assert.ok(Math.abs(costOf(million({ input: 1e6, output: 1e6, cache_write_5m: 1e6, cache_write_1h: 1e6, cache_read: 1e6 })) - 37.2) < 1e-9);
  });

  test('fast mode doubles every class', () => {
    assert.equal(costOf(million({ input: 1e6, output: 1e5, speed: 'fast' })), 12);
  });

  test('the longest matching model prefix wins, so a point release is not priced as its major', () => {
    // opus-5-5 is $4 in; opus-5 is $5 in. Matching "claude-opus-5" first would overcharge.
    assert.equal(costOf(million({ model: 'claude-opus-5-5', input: 1e6 })), 4);
    assert.equal(costOf(million({ model: 'claude-opus-5-1', input: 1e6 })), 5);
    // fable-5-1 and fable-5 differ only in cache-read price.
    assert.equal(costOf(million({ model: 'claude-fable-5-1', cache_read: 1e6 })), 0.25);
    assert.equal(costOf(million({ model: 'claude-fable-5', cache_read: 1e6 })), 1);
  });

  test('model ids with a date or a context suffix still match', () => {
    assert.equal(costOf(million({ model: 'claude-opus-5-5-20260301', input: 1e6 })), 4);
    assert.equal(costOf(million({ model: 'claude-opus-5-5[1m]', input: 1e6 })), 4);
  });

  test('a model with no price is unpriced, never free', () => {
    assert.equal(costOf(million({ model: 'claude-future-9', input: 1e6 })), null);
  });

  test('records the date of the price table it used', () => {
    assert.match(pricesAsOf(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('findTranscript', () => {
  test('finds a session across project directories', (t) => {
    const sb = sandbox(t);
    const { transcriptPath } = writeSession({ home: sb.home, sessionId: 'abc', rows: [] });
    assert.equal(findTranscript(join(sb.home, '.claude', 'projects'), 'abc'), transcriptPath);
  });

  test('returns null for an unknown session or a missing projects directory', (t) => {
    const sb = sandbox(t);
    assert.equal(findTranscript(join(sb.home, 'nope'), 'abc'), null);
    writeSession({ home: sb.home, sessionId: 'present', rows: [] });
    assert.equal(findTranscript(join(sb.home, '.claude', 'projects'), 'absent'), null);
  });
});
