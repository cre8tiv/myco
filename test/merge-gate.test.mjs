// The merge gate is the one thing standing between an agent and an unreviewed merge, so
// these tests are mostly about what must be blocked and, just as important, what an IC
// does every day that must never be.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, runHook, script, writeProfile } from './helpers.mjs';

const GATE = script('engineering-team', 'merge-gate.mjs');
const LEAD = 'engineering-team:tech-lead';
const IC = 'engineering-team:ic-generalist';

/**
 * @param {ReturnType<typeof sandbox>} sb
 * @param {{tool?: string, command?: string, input?: object, agent?: string | null}} call
 */
async function gate(sb, { tool = 'Bash', command, input, agent = LEAD }) {
  const payload = { cwd: sb.project, tool_name: tool, tool_input: input ?? { command } };
  if (agent) payload.agent_type = agent;
  return runHook(GATE, payload, { env: sb.env });
}

describe('merge_policy: human-approval', () => {
  const BLOCKED = [
    ['Bash', 'gh pr merge 42'],
    ['Bash', 'gh pr merge 42 --squash --delete-branch'],
    ['PowerShell', 'gh pr merge 42 --squash'],
    ['PowerShell', 'gh.exe pr merge 42'],
    ['Bash', 'gh api -X PUT repos/acme/app/pulls/42/merge -f merge_method=squash'],
    ['Bash', 'gh api graphql -f query=\'mutation { mergePullRequest(input: {pullRequestId: "X"}) { clientMutationId } }\''],
    ['Bash', 'az repos pr update --id 42 --status completed'],
    ['Bash', 'git push origin main'],
    ['Bash', 'git push origin HEAD:main'],
    ['Bash', 'git push origin HEAD:refs/heads/main'],
    ['Bash', 'git push origin +main'],
    ['Bash', 'git push --force-with-lease origin HEAD:main'],
    ['Bash', 'git push origin :main'],
    ['Bash', 'git add -A && git commit -m wip && git push origin main'],
    ['PowerShell', 'git add .; git commit -m wip; git push origin main'],
    ['Bash', 'cd app && git push origin main'],
    ['Bash', 'git -C ../app push origin main'],
    ['Bash', 'GH_TOKEN=abc gh pr merge 42'],
    ['Bash', 'bash -c "gh pr merge 42"'],
    ['PowerShell', 'pwsh -NoProfile -Command "gh pr merge 42 --squash"'],
  ];
  for (const [tool, command] of BLOCKED) {
    test(`blocks ${tool}: ${command}`, async (t) => {
      const sb = sandbox(t);
      writeProfile(sb.project, { merge_policy: 'human-approval', trunk_branch: 'main' });
      const r = await gate(sb, { tool, command });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /human/i);
    });
  }

  const ALLOWED = [
    // How an IC keeps its worktree current and publishes its branch.
    'git merge origin/main',
    'git pull --rebase origin main',
    'git fetch origin main',
    'git push -u origin CLOUD-123-retry-logic',
    'git push origin HEAD',
    'git push origin feature/main-menu',
    'git push origin main:feature/from-main',
    'git push origin HEAD && gh pr create --fill',
    // Reading PRs is fine; only completing one is a merge.
    'gh pr view 42',
    'gh pr checks 42 --watch',
    'gh pr review 42 --comment -b "looks good"',
    'gh api repos/acme/app/pulls/42/comments',
    'git stash push -m main',
    'echo "to merge, run gh pr merge 42"',
    'git commit -m "revert: undo git push origin main"',
    'git -C ../app push origin feature/x',
  ];
  for (const command of ALLOWED) {
    test(`allows: ${command}`, async (t) => {
      const sb = sandbox(t);
      writeProfile(sb.project, { merge_policy: 'human-approval', trunk_branch: 'main' });
      const r = await gate(sb, { command });
      assert.equal(r.status, 0, r.stderr);
    });
  }

  test('blocks merge tools exposed by an MCP server', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    for (const tool of ['mcp__github__merge_pull_request', 'mcp__plugin_github_github__merge_pull_request']) {
      const r = await gate(sb, { tool, input: { owner: 'acme', repo: 'app', pullNumber: 42 } });
      assert.equal(r.status, 2, tool);
    }
  });

  test('blocks completing a PR by status through an MCP server, but not other updates', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    const tool = 'mcp__azure-devops__update_pull_request';
    assert.equal((await gate(sb, { tool, input: { id: 42, status: 'completed' } })).status, 2);
    assert.equal((await gate(sb, { tool, input: { id: 42, status: 'active', title: 'renamed' } })).status, 0);
  });

  test('leaves read-only MCP tools alone', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    assert.equal((await gate(sb, { tool: 'mcp__github__get_pull_request', input: { pullNumber: 42 } })).status, 0);
    assert.equal((await gate(sb, { tool: 'Read', input: { file_path: 'merge-notes.md' } })).status, 0);
  });

  test('the block tells the agent what to do instead', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    const r = await gate(sb, { command: 'gh pr merge 42' });
    assert.match(r.stderr, /handoff/i);
    assert.match(r.stderr, /project\.md/);
  });

  test('a heredoc commit message that mentions merging is not a merge', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    const command = `git commit -q -F - <<'EOF'
fix: stop retrying forever

gh pr merge is blocked for agents by the merge gate
git push origin main stays with a human
EOF
git push -u origin CLOUD-9`;
    const r = await gate(sb, { command });
    assert.equal(r.status, 0, r.stderr);
  });

  test('a push to the trunk after a heredoc is still caught', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    const command = `git commit -q -F - <<'EOF'
fix
EOF
git push origin main`;
    assert.equal((await gate(sb, { command })).status, 2);
  });

  test('a commit message that mentions merging is not a merge', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    const r = await gate(sb, { command: 'git commit -m "docs: explain how gh pr merge is gated"' });
    assert.equal(r.status, 0, r.stderr);
  });
});

describe('policy resolution', () => {
  test('a missing profile is treated as gated', async (t) => {
    const sb = sandbox(t);
    assert.equal((await gate(sb, { command: 'gh pr merge 42' })).status, 2);
  });

  test('a profile with no frontmatter is treated as gated', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, '');
    assert.equal((await gate(sb, { command: 'gh pr merge 42' })).status, 2);
  });

  test('autonomous allows merging', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'autonomous' });
    for (const command of ['gh pr merge 42 --squash', 'git push origin main']) {
      assert.equal((await gate(sb, { command })).status, 0, command);
    }
  });

  test('autonomous, written the way people write YAML (quotes, trailing comment, CRLF)', async (t) => {
    const sb = sandbox(t);
    for (const fm of ['merge_policy: "autonomous"', "merge_policy: 'Autonomous'", 'merge_policy: autonomous   # we trust CI', 'merge_policy: autonomous\r\ntrunk_branch: main\r']) {
      writeProfile(sb.project, fm);
      assert.equal((await gate(sb, { command: 'gh pr merge 42' })).status, 0, fm);
    }
  });

  test('an unfilled template placeholder never means autonomous', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: '<human-approval | autonomous>' });
    assert.equal((await gate(sb, { command: 'gh pr merge 42' })).status, 2);
  });

  test('a typo in the policy fails safe', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'autonomus' });
    assert.equal((await gate(sb, { command: 'gh pr merge 42' })).status, 2);
  });

  test('the profile is found from inside a worktree below the project root', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'autonomous' });
    const worktree = join(sb.project, '.claude', 'worktrees', 'agent-1', 'src');
    mkdirSync(worktree, { recursive: true });
    const r = await runHook(GATE, { agent_type: IC, cwd: worktree, tool_name: 'Bash', tool_input: { command: 'gh pr merge 1' } }, { env: sb.env });
    assert.equal(r.status, 0);
  });
});

describe('trunk_branch', () => {
  test('protects the configured trunk, not a hard-coded main', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval', trunk_branch: 'develop' });
    assert.equal((await gate(sb, { command: 'git push origin develop' })).status, 2);
    assert.equal((await gate(sb, { command: 'git push origin HEAD:refs/heads/develop' })).status, 2);
    assert.equal((await gate(sb, { command: 'git push origin main' })).status, 0);
  });

  test('a trailing comment is not part of the branch name', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, 'merge_policy: human-approval\ntrunk_branch: develop   # our integration branch');
    assert.equal((await gate(sb, { command: 'git push origin develop' })).status, 2);
  });

  test('an unfilled placeholder falls back to main instead of protecting a branch called "<main>"', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval', trunk_branch: '<main>' });
    assert.equal((await gate(sb, { command: 'git push origin main' })).status, 2);
  });

  test('a branch whose name merely contains the trunk name is not the trunk', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval', trunk_branch: 'main' });
    for (const branch of ['main-menu', 'domain', 'fix/main', 'maintenance']) {
      assert.equal((await gate(sb, { command: `git push origin ${branch}` })).status, 0, branch);
    }
  });
});

describe('who is gated', () => {
  test('a human in a plain session is never blocked', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    assert.equal((await gate(sb, { command: 'gh pr merge 42', agent: null })).status, 0);
  });

  test('every team agent is gated, not just the lead', async (t) => {
    const sb = sandbox(t);
    writeProfile(sb.project, { merge_policy: 'human-approval' });
    for (const agent of [LEAD, IC, 'engineering-team:qa-specialist', 'engineering-team:code-reviewer']) {
      assert.equal((await gate(sb, { command: 'gh pr merge 42', agent })).status, 2, agent);
    }
  });
});

describe('failing safe', () => {
  test('a broken payload never blocks work', async (t) => {
    const sb = sandbox(t);
    for (const payload of ['', 'not json', '{"agent_type":', '[]', 'null']) {
      assert.equal((await runHook(GATE, payload, { env: sb.env })).status, 0, JSON.stringify(payload));
    }
  });

  test('a call with no tool input is allowed', async (t) => {
    const sb = sandbox(t);
    const r = await runHook(GATE, { agent_type: LEAD, cwd: sb.project, tool_name: 'Bash' }, { env: sb.env });
    assert.equal(r.status, 0);
  });
});
