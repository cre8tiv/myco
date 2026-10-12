// Agents ship as plain markdown, so the text they share (how to read the project
// profile, how to report friction, the rules for specialists working in one tree) is
// copied into each file. scripts/sync-agent-blocks.mjs keeps the copies identical to one
// source in shared/agent-blocks/. These tests cover the script, and the repository's own
// agents against it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sandbox, runNode } from './helpers.mjs';

const SYNC = join(ROOT, 'scripts', 'sync-agent-blocks.mjs');
const wrap = (name, text) => `<!-- shared:${name} -->${text}<!-- /shared:${name} -->`;

/**
 * A throwaway repository layout with the given canonical blocks and agents.
 * @param {ReturnType<typeof sandbox>} sb
 * @param {Record<string, string>} blocks name -> canonical text
 * @param {Record<string, string>} agents "plugin/agent" -> file content
 */
function fixture(sb, blocks, agents) {
  const root = join(sb.root, 'repo');
  mkdirSync(join(root, 'shared', 'agent-blocks'), { recursive: true });
  for (const [name, text] of Object.entries(blocks)) writeFileSync(join(root, 'shared', 'agent-blocks', `${name}.md`), text + '\n');
  for (const [path, content] of Object.entries(agents)) {
    const [plugin, agent] = path.split('/');
    mkdirSync(join(root, 'plugins', plugin, 'agents'), { recursive: true });
    writeFileSync(join(root, 'plugins', plugin, 'agents', `${agent}.md`), content);
  }
  const run = (...args) => runNode(SYNC, { args: ['--root', root, ...args] });
  const read = (path) => {
    const [plugin, agent] = path.split('/');
    return readFileSync(join(root, 'plugins', plugin, 'agents', `${agent}.md`), 'utf8');
  };
  return { root, run, read };
}

const FM = '---\nname: x\ndescription: x\n---\n';

describe('sync-agent-blocks.mjs', () => {
  test('--check passes when every block matches, and says how many agents it covered', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { greet: 'Say hello.' }, { 'p/a': `${FM}Intro. ${wrap('greet', 'Say hello.')}\n`, 'p/b': `${FM}${wrap('greet', 'Say hello.')}\n` });
    const r = await f.run('--check');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /in sync across 2 agents/);
  });

  test('--check names the agent and block that drifted, and changes nothing', async (t) => {
    const sb = sandbox(t);
    const stale = `${FM}${wrap('greet', 'Say hullo.')}\n`;
    const f = fixture(sb, { greet: 'Say hello.' }, { 'p/a': stale });
    const r = await f.run('--check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /plugins\/p\/agents\/a\.md: shared:greet is out of date/);
    assert.match(r.stderr, /npm run sync:agents/);
    assert.equal(f.read('p/a'), stale);
  });

  test('sync rewrites only the marked text, and a second run changes nothing', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { greet: 'Say hello.', bye: 'Say bye.' }, {
      'p/a': `${FM}Keep this. ${wrap('greet', 'old text')} And this.\n- ${wrap('bye', 'older')}\nTail.\n`,
    });
    const first = await f.run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /plugins\/p\/agents\/a\.md/);
    assert.equal(f.read('p/a'), `${FM}Keep this. ${wrap('greet', 'Say hello.')} And this.\n- ${wrap('bye', 'Say bye.')}\nTail.\n`);
    const second = await f.run();
    assert.match(second.stdout, /Already in sync/);
  });

  test('keeps Windows line endings', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { greet: 'Say hello.' }, { 'p/a': `${FM.replace(/\n/g, '\r\n')}A ${wrap('greet', 'stale')}\r\nB\r\n` });
    await f.run();
    assert.equal(f.read('p/a'), `${FM.replace(/\n/g, '\r\n')}A ${wrap('greet', 'Say hello.')}\r\nB\r\n`);
  });

  test('canonical text is inserted literally, including $ sequences that String.replace would expand', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { cost: 'Costs $& and $1 and $$.' }, { 'p/a': `${FM}${wrap('cost', 'x')}\n` });
    await f.run();
    assert.equal(f.read('p/a'), `${FM}${wrap('cost', 'Costs $& and $1 and $$.')}\n`);
  });

  test('an unknown block is an error, not a silent skip', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { greet: 'Say hello.' }, { 'p/a': `${FM}${wrap('typo', 'x')}\n` });
    const r = await f.run('--check');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown shared block "typo"/);
  });

  test('unbalanced markers are an error', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { greet: 'Say hello.' }, { 'p/a': `${FM}<!-- shared:greet -->Say hello.\n` });
    const r = await f.run('--check');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unbalanced/);
  });

  test('a block that spans lines is an error, since a stray marker could swallow the agent', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { greet: 'Say hello.' }, { 'p/a': `${FM}<!-- shared:greet -->one\ntwo<!-- /shared:greet -->\n` });
    const r = await f.run('--check');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /spans lines/);
  });

  test('a canonical block must be a single line', async (t) => {
    const sb = sandbox(t);
    const f = fixture(sb, { greet: 'line one\nline two' }, { 'p/a': `${FM}${wrap('greet', 'x')}\n` });
    assert.equal((await f.run('--check')).status, 2);
  });
});

describe('this repository', () => {
  const agentFiles = readdirSync(join(ROOT, 'plugins')).flatMap((p) => readdirSync(join(ROOT, 'plugins', p, 'agents')).map((f) => ({ id: f.replace(/\.md$/, ''), path: join(ROOT, 'plugins', p, 'agents', f) })));
  const text = (a) => readFileSync(a.path, 'utf8');
  const blocksDir = join(ROOT, 'shared', 'agent-blocks');
  const blocks = Object.fromEntries(readdirSync(blocksDir).map((f) => [f.replace(/\.md$/, ''), readFileSync(join(blocksDir, f), 'utf8').replace(/\r?\n+$/, '')]));
  const has = (a, name) => text(a).includes(`<!-- shared:${name} -->`);

  test('every shared block in every agent matches its source', async () => {
    const r = await runNode(SYNC, { args: ['--check'] });
    assert.equal(r.status, 0, r.stderr);
  });

  test('every agent but the coach reads the knowledge sources and reports friction', () => {
    for (const a of agentFiles.filter((x) => x.id !== 'agent-coach')) {
      assert.ok(has(a, 'knowledge'), `${a.id} lost its knowledge block`);
      assert.ok(has(a, 'friction'), `${a.id} lost its friction block`);
    }
  });

  test('design specialists keep the rules for sharing one working tree', () => {
    for (const id of ['architect', 'security-reviewer', 'tech-designer', 'ux-designer']) {
      const a = /** @type {{id: string, path: string}} */ (agentFiles.find((x) => x.id === id));
      assert.ok(has(a, 'specialist-commit') && has(a, 'status-line'), id);
    }
  });

  test('agents that write files and open PRs keep the no-heredoc rule', () => {
    for (const id of ['ic-generalist', 'ic-specialist-backend', 'qa-specialist', 'tech-lead']) {
      assert.ok(has(/** @type {any} */ (agentFiles.find((x) => x.id === id)), 'no-heredocs'), id);
    }
  });

  test('no block is orphaned, and none appears twice in one agent', () => {
    for (const name of Object.keys(blocks)) assert.ok(agentFiles.some((a) => has(a, name)), `${name} is used by no agent`);
    for (const a of agentFiles) {
      for (const name of Object.keys(blocks)) assert.ok(text(a).split(`<!-- shared:${name} -->`).length <= 2, `${a.id} includes ${name} twice`);
    }
  });

  test('shared text is not also pasted into an agent outside its markers', () => {
    // A copy without markers would be invisible to the sync, and would drift.
    for (const a of agentFiles) {
      const outside = text(a).replace(/<!-- shared:([\w-]+) -->[\s\S]*?<!-- \/shared:\1 -->/g, '');
      for (const [name, body] of Object.entries(blocks)) {
        assert.equal(outside.includes(body.slice(0, 80)), false, `${a.id} has an unmarked copy of ${name}`);
      }
    }
  });
});
