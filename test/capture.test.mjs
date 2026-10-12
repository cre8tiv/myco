// The hook sink and the friction self-report are the coach's raw material. The tests
// run them the way Claude Code does, as processes with an event on stdin, against a
// throwaway home directory, and read back what landed in ~/.claude/ops/<stream>/.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, runHook, runNode, script, writeProfile, writeSession, assistant, startWork, usage, readJsonl, opsFile } from './helpers.mjs';

const CAPTURE = script('team-ops', 'capture.mjs');
const FRICTION = script('team-ops', 'friction.mjs');

/** A project with a committed profile naming its stream. */
function project(t) {
  const sb = sandbox(t);
  writeProfile(sb.project, { stream: 'alpha-stream' });
  return sb;
}

const events = (sb) => readJsonl(opsFile(sb.home, 'alpha-stream', 'events.jsonl'));
const friction = (sb) => readJsonl(opsFile(sb.home, 'alpha-stream', 'friction.jsonl'));

describe('capture.mjs: hook events', () => {
  test('records a team agent’s tool failure with the command and the error', async (t) => {
    const sb = project(t);
    const r = await runHook(CAPTURE, {
      hook_event_name: 'PostToolUseFailure',
      agent_type: 'engineering-team:ic-generalist',
      session_id: 's1',
      agent_id: 'ic1',
      cwd: sb.project,
      permission_mode: 'acceptEdits',
      effort: { level: 'high' },
      tool_name: 'Bash',
      tool_input: { command: 'npm test -- --runInBand' },
      tool_response: 'sh: jest: command not found',
    }, { env: sb.env });
    assert.equal(r.status, 0);
    const [e] = events(sb);
    assert.equal(e.event, 'PostToolUseFailure');
    assert.equal(e.agent, 'engineering-team:ic-generalist');
    assert.equal(e.tool, 'Bash');
    assert.equal(e.target, 'npm test -- --runInBand');
    assert.equal(e.error, 'sh: jest: command not found');
    assert.equal(e.mode, 'acceptEdits');
    assert.equal(e.effort, 'high');
    assert.equal(e.session, 's1');
    assert.match(e.ts, /^\d{4}-\d\d-\d\dT/);
  });

  test('picks the most telling argument per tool as the target', async (t) => {
    const sb = project(t);
    const base = { hook_event_name: 'PostToolUseFailure', agent_type: 'engineering-team:ic-generalist', session_id: 's1', cwd: sb.project };
    await runHook(CAPTURE, { ...base, tool_name: 'Read', tool_input: { file_path: 'src/app.ts' } }, { env: sb.env });
    await runHook(CAPTURE, { ...base, tool_name: 'Grep', tool_input: { pattern: 'TODO' } }, { env: sb.env });
    await runHook(CAPTURE, { ...base, tool_name: 'WebFetch', tool_input: { url: 'https://example.com/docs' } }, { env: sb.env });
    assert.deepEqual(events(sb).map((e) => e.target), ['src/app.ts', 'TODO', 'https://example.com/docs']);
  });

  test('ignores sessions that are not team agents', async (t) => {
    // The hooks fire for every session in the project, and an ad-hoc session's failures
    // are not team activity: they would skew the coach's numbers.
    const sb = project(t);
    for (const agent_type of [undefined, 'main', 'Explore', 'general-purpose']) {
      const r = await runHook(CAPTURE, { hook_event_name: 'PostToolUseFailure', agent_type, session_id: 's1', cwd: sb.project, tool_name: 'Bash', tool_input: { command: 'x' } }, { env: sb.env });
      assert.equal(r.status, 0);
    }
    assert.equal(existsSync(opsFile(sb.home, 'alpha-stream', 'events.jsonl')), false);
  });

  test("names a subagent by its transcript metadata when the hook says only 'main'", async (t) => {
    const sb = project(t);
    const { transcriptPath } = writeSession({
      home: sb.home,
      sessionId: 's2',
      lead: 'design-team:product-lead',
      rows: [startWork(1, 'order-exceptions/round-1')],
      subagents: [{ id: 'sec', agentType: 'design-team:security-reviewer', description: 'threat model', rows: [assistant({ at: 2, usage: usage({}), sidechain: true })] }],
    });
    await runHook(CAPTURE, {
      hook_event_name: 'SubagentStop',
      agent_type: 'main',
      agent_id: 'sec',
      session_id: 's2',
      transcript_path: transcriptPath,
      cwd: sb.project,
      last_assistant_message: 'Wrote security-review.md with 9 controls and 2 open questions.',
    }, { env: sb.env });
    const [e] = events(sb);
    assert.equal(e.agent, 'design-team:security-reviewer');
    assert.equal(e.work, 'order-exceptions/round-1');
    assert.equal(e.report, 'Wrote security-review.md with 9 controls and 2 open questions.');
  });

  test('long fields are truncated, so one runaway error cannot bloat the log', async (t) => {
    const sb = project(t);
    await runHook(CAPTURE, {
      hook_event_name: 'PostToolUseFailure', agent_type: 'engineering-team:qa-specialist', session_id: 's1', cwd: sb.project,
      tool_name: 'Bash', tool_input: { command: 'x'.repeat(5000) }, tool_response: 'e'.repeat(5000),
    }, { env: sb.env });
    const [e] = events(sb);
    assert.equal(e.target.length, 301);
    assert.equal(e.error.length, 601);
    assert.ok(e.target.endsWith('…'));
  });

  test('empty fields are left out rather than written as null', async (t) => {
    const sb = project(t);
    await runHook(CAPTURE, { hook_event_name: 'PreCompact', agent_type: 'engineering-team:ic-generalist', cwd: sb.project }, { env: sb.env });
    const [e] = events(sb);
    assert.deepEqual(Object.keys(e).sort(), ['agent', 'cwd', 'event', 'ts']);
  });

  test('events from every worktree of a project land in one stream', async (t) => {
    const sb = project(t);
    const wt = join(sb.project, '.claude', 'worktrees', 'agent-7');
    mkdirSync(wt, { recursive: true });
    for (const cwd of [sb.project, wt]) {
      await runHook(CAPTURE, { hook_event_name: 'SessionEnd', agent_type: 'engineering-team:ic-generalist', cwd }, { env: sb.env });
    }
    assert.equal(events(sb).length, 2);
  });

  test('a project with no profile still gets a stream, named after its directory', async (t) => {
    const sb = sandbox(t);
    await runHook(CAPTURE, { hook_event_name: 'SessionEnd', agent_type: 'engineering-team:ic-generalist', cwd: sb.project }, { env: sb.env });
    assert.equal(readJsonl(opsFile(sb.home, 'proj-alpha', 'events.jsonl')).length, 1);
  });

  test('never fails the tool call, whatever it is sent', async (t) => {
    const sb = project(t);
    for (const payload of ['', 'garbage', '{"hook_event_name":', 'null', '[]']) {
      assert.equal((await runHook(CAPTURE, payload, { env: sb.env })).status, 0, JSON.stringify(payload));
    }
    assert.equal(existsSync(opsFile(sb.home, 'alpha-stream', 'events.jsonl')), false);
  });
});

describe('friction.mjs: agents reporting their own process friction', () => {
  const report = (sb, args, env = {}) => runNode(FRICTION, { args, cwd: sb.project, env: { ...sb.env, ...env } });

  test('requires a note, and says how to call it', async (t) => {
    const sb = project(t);
    const r = await report(sb, ['--agent', 'ic-generalist', '--kind', 'tooling']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage: friction\.mjs/);
    assert.equal(friction(sb).length, 0);
  });

  test('records the note, kind and agent', async (t) => {
    const sb = project(t);
    const r = await report(sb, ['--agent', 'ic-generalist', '--kind', 'instructions', '--note', 'definition says run the test script but names none']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /friction logged/);
    const [f] = friction(sb);
    assert.equal(f.agent, 'ic-generalist');
    assert.equal(f.kind, 'instructions');
    assert.equal(f.note, 'definition says run the test script but names none');
  });

  test('defaults the kind and truncates a rambling note', async (t) => {
    const sb = project(t);
    await report(sb, ['--agent', 'qa-specialist', '--note', 'n'.repeat(3000)]);
    const [f] = friction(sb);
    assert.equal(f.kind, 'unspecified');
    assert.equal(f.note.length, 1000);
  });

  test("ties the report to the agent's full name and unit of work from the session", async (t) => {
    const sb = project(t);
    writeSession({
      home: sb.home,
      sessionId: 'sess-f',
      lead: 'engineering-team:tech-lead',
      rows: [startWork(1, 'CLOUD-1')],
      subagents: [{ id: 'ic', agentType: 'engineering-team:ic-generalist', description: '[CLOUD-42] fix pagination', rows: [assistant({ at: 2, usage: usage({}), sidechain: true })] }],
    });
    await report(sb, ['--agent', 'ic-generalist', '--kind', 'scope', '--note', 'task named three services'], { CLAUDE_CODE_SESSION_ID: 'sess-f' });
    const [f] = friction(sb);
    assert.equal(f.agent, 'engineering-team:ic-generalist');
    assert.equal(f.work, 'CLOUD-42');
    assert.equal(f.parent_work, 'CLOUD-1');
    assert.equal(f.session, 'sess-f');
    assert.equal(f.agent_id, 'ic');
  });

  test('--work overrides the work, for a problem that belongs to different work', async (t) => {
    // A design flaw found while building belongs to the package it came from.
    const sb = project(t);
    writeSession({ home: sb.home, sessionId: 'sess-g', lead: 'engineering-team:tech-lead', rows: [startWork(1, 'order-exceptions/phase-1')] });
    await report(sb, ['--agent', 'tech-lead', '--kind', 'handoff', '--work', 'order-exceptions', '--note', 'SEC-3 has no row in the traceability table'], { CLAUDE_CODE_SESSION_ID: 'sess-g' });
    await report(sb, ['--agent', 'tech-lead', '--kind', 'handoff', '--ticket', 'CLOUD-9', '--note', 'older flag name still works'], { CLAUDE_CODE_SESSION_ID: 'sess-g' });
    assert.deepEqual(friction(sb).map((f) => f.work), ['order-exceptions', 'CLOUD-9']);
  });

  test('still logs when it cannot resolve the session', async (t) => {
    const sb = project(t);
    const r = await report(sb, ['--agent', 'architect', '--kind', 'tooling', '--note', 'figma connector not authorized'], { CLAUDE_CODE_SESSION_ID: 'cleaned-up' });
    assert.equal(r.status, 0);
    assert.equal(friction(sb)[0].agent, 'architect');
  });

  test('lands in the same stream as hook events', async (t) => {
    const sb = project(t);
    await report(sb, ['--agent', 'x', '--note', 'y']);
    assert.equal(existsSync(opsFile(sb.home, 'alpha-stream', 'friction.jsonl')), true);
  });
});
