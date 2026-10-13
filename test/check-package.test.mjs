// check-package.mjs does the counting part of a design package's readiness check: the
// things a model gets wrong by skimming. Each test starts from a package that passes and
// breaks one thing, because the useful question is whether the right problem is named.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, runNode, script } from './helpers.mjs';

const CHECK = script('design-team', 'check-package.mjs');

const INDEX = `# Pick waves

| | |
| --- | --- |
| **Status** | Ready for engineering |
| **Owner** | Sam |

## Documents

| Document | Author | Status | Open questions |
| --- | --- | --- | --- |
| [PRD](prd.md) | product-lead | Done | 0 |

## Codebases

| Codebase | Role | Commit grounded at | Slices that change it |
| --- | --- | --- | --- |
| orders-service | this repo | 4f2a9c1 | S1, S2 |
| billing-contract | contract | \`a1b2c3d4e5f6\` | — |

## Readiness

- [x] No document has open questions.
- [x] Every PRD requirement is in exactly one phase.
`;

const PRD = `| | |
| --- | --- |
| **Status** | Decided |

## 4. Actors

| ID | Actor | Kind | Context | Need | Identity & permissions |
| --- | --- | --- | --- | --- | --- |
| A-1 | Warehouse picker | human | shift start | fast scan | badge |
| A-2 | Wave scheduler | system | nightly | release waves | service account |

## 5. Key scenarios

> **SC-1 — Shift start** (A-1, requirements PCK-1, PCK-2)
> As A-1 I scan a tote.

> **SC-2 — Nightly release** (A-2, requirements WAV-1)
> As A-2 the scheduler releases wave 14.

## 7. Functional requirements

### Picking

| ID | Requirement | Actor | Priority |
| --- | --- | --- | --- |
| PCK-1 | Scan confirms a pick | A-1 | P0 |
| PCK-2 | Short pick is flagged | A-1 | P1 |
| PCK-3 | Pick history export | A-1 | P2 |

### Waves

| ID | Requirement | Actor | Priority |
| --- | --- | --- | --- |
| WAV-1 | Wave released nightly | A-2 | P0 |

### Security

| ID | Requirement | Actor | Priority |
| --- | --- | --- | --- |
| SEC-1 | Scanner tokens expire | — | P0 |

## 10. Phasing

| Phase | Scope (requirement IDs) | Exit criteria |
| --- | --- | --- |
| 1 | PCK-1, PCK-2, WAV-1, SEC-1 | A pick completes end to end |
| 2 | PCK-3 | Export downloads |

## 13. Decisions

| # | Question | Decision |
| --- | --- | --- |
| D-1 | Scope | Picking first |
`;

const SECURITY = `| | |
| --- | --- |
| **Status** | Decided |

## 6. Required controls

| ID | Control | Mitigates | Priority | Verified by |
| --- | --- | --- | --- | --- |
| SEC-1 | Tokens expire in 8h | T-1 | P0 | integration test |

## 10. Resolved

None.
`;

const TECH = `| | |
| --- | --- |
| **Status** | Decided |

## 11. Traceability

| Requirement | Implemented in | Verified by |
| --- | --- | --- |
| PCK-1 | pick-service | e2e pick |
| PCK-2 | pick-service | unit |
| WAV-1 | scheduler | nightly test |
| SEC-1 | auth middleware | integration test |

## 14. Resolved

D-1 settled scope.
`;

const GOOD = { 'README.md': INDEX, 'prd.md': PRD, 'security-review.md': SECURITY, 'tech-design.md': TECH };

/**
 * Writes a package, with some files replaced, and runs the check.
 * @param {import('node:test').TestContext} t
 * @param {Record<string, string>} [over] replacement text per file
 * @param {string[]} [extra] extra arguments
 */
async function check(t, over = {}, extra = []) {
  const sb = sandbox(t);
  const dir = join(sb.root, 'pkg');
  mkdirSync(dir);
  for (const [name, text] of Object.entries({ ...GOOD, ...over })) writeFileSync(join(dir, name), text);
  return runNode(CHECK, { args: [dir, ...extra] });
}
const edit = (text, from, to) => {
  assert.ok(text.includes(from), `fixture lacks: ${from}`);
  return text.replace(from, to);
};

describe('check-package.mjs', () => {
  test('a consistent package passes every check', async (t) => {
    const r = await check(t);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /All \d+ checks passed/);
  });

  test('--json reports each check, for a script to read', async (t) => {
    const r = await check(t, {}, ['--json']);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, true);
    assert.ok(out.checks.length >= 7);
  });

  test('a requirement in no phase is named', async (t) => {
    const r = await check(t, { 'prd.md': edit(PRD, '| 2 | PCK-3 |', '| 2 | |') });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /PCK-3 is in no phase/);
  });

  test('a requirement in two phases is named, with both', async (t) => {
    const r = await check(t, { 'prd.md': edit(PRD, '| 2 | PCK-3 |', '| 2 | PCK-3, PCK-1 |') });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /PCK-1 is in 2 phases \(1, 2\)/);
  });

  test('a phase scope written as a range covers every ID in it', async (t) => {
    const prd = edit(edit(PRD, '| 1 | PCK-1, PCK-2, WAV-1, SEC-1 |', '| 1 | PCK-1–PCK-2, WAV-1, SEC-1 |'), '| 2 | PCK-3 |', '| 2 | PCK-3 |');
    assert.equal((await check(t, { 'prd.md': prd })).status, 0);
    const split = edit(prd, '| 2 | PCK-3 |', '| 2 | PCK-1..3 |');
    assert.match((await check(t, { 'prd.md': split })).stdout, /PCK-1 is in 2 phases/);
  });

  test('a P0 or P1 requirement missing from the traceability table is named; P2 need not be there', async (t) => {
    const r = await check(t, { 'tech-design.md': edit(TECH, '| PCK-2 | pick-service | unit |\n', '') });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /PCK-2 \(P1\) is not in the traceability table/);
    assert.doesNotMatch(r.stdout, /PCK-3/);
  });

  test('a blank cell in the traceability table fails', async (t) => {
    const r = await check(t, { 'tech-design.md': edit(TECH, '| WAV-1 | scheduler | nightly test |', '| WAV-1 | scheduler | |') });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /WAV-1: the traceability row has a blank cell/);
  });

  test('a security control that is not a PRD requirement, or not traced, fails', async (t) => {
    const security = edit(SECURITY, '| SEC-1 | Tokens expire in 8h | T-1 | P0 | integration test |', '| SEC-1 | Tokens expire in 8h | T-1 | P0 | integration test |\n| SEC-2 | Audit log | T-2 | P1 | review |');
    const r = await check(t, { 'security-review.md': security });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /SEC-2 is a security control but not a PRD requirement/);
    assert.match(r.stdout, /SEC-2 is not in the traceability table/);
  });

  test('open questions fail whether the status line or the section says so', async (t) => {
    const byStatus = await check(t, { 'tech-design.md': edit(TECH, '| **Status** | Decided |', '| **Status** | Draft — 2 open questions |') });
    assert.match(byStatus.stdout, /tech-design\.md: status says 2 open questions/);
    const bySection = await check(t, { 'prd.md': edit(PRD, '## 13. Decisions', '## 13. Open questions\n\n1. Should exports be async?\n\n## 15. Decisions') });
    assert.match(bySection.stdout, /prd\.md: the Open questions section still has 1 line/);
  });

  test('an emptied Open questions section, or one that says none, passes', async (t) => {
    const prd = edit(PRD, '## 13. Decisions', '## 13. Open questions\n\nNone.\n\n## 14. Decisions');
    assert.equal((await check(t, { 'prd.md': prd })).status, 0);
  });

  test('a requirement naming an actor the PRD never defines fails, and an actor with no scenario fails', async (t) => {
    const r = await check(t, { 'prd.md': edit(PRD, '| PCK-3 | Pick history export | A-1 | P2 |', '| PCK-3 | Pick history export | A-9 | P2 |') });
    assert.match(r.stdout, /PCK-3: actor A-9 is not defined/);
    const noScenario = edit(PRD, '> **SC-2 — Nightly release** (A-2, requirements WAV-1)', '> **SC-2 — Nightly release** (requirements WAV-1)');
    assert.match((await check(t, { 'prd.md': noScenario })).stdout, /A-2 has no key scenario/);
  });

  test('a requirement with an empty Actor cell fails; "—" for system-wide is fine', async (t) => {
    const r = await check(t, { 'prd.md': edit(PRD, '| PCK-3 | Pick history export | A-1 | P2 |', '| PCK-3 | Pick history export |  | P2 |') });
    assert.match(r.stdout, /PCK-3: the Actor cell is empty/);
  });

  test('a codebase with no commit recorded fails', async (t) => {
    const r = await check(t, { 'README.md': edit(INDEX, '| 4f2a9c1 |', '| <commit> |') });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /orders-service: no commit recorded/);
  });

  test('an unreferenced ADR is advice, not a failure', async (t) => {
    const r = await check(t, { 'architecture.md': '## 11. Decisions\n\n### ADR-1: Use a queue\n\nBecause.\n' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /NOTE\s+ADR-1 not mentioned/);
  });

  test('Windows line endings do not change the result', async (t) => {
    const crlf = Object.fromEntries(Object.entries(GOOD).map(([k, v]) => [k, v.replace(/\n/g, '\r\n')]));
    assert.equal((await check(t, crlf)).status, 0);
    assert.equal((await check(t, { ...crlf, 'prd.md': edit(PRD, '| 2 | PCK-3 |', '| 2 | |').replace(/\n/g, '\r\n') })).status, 1);
  });

  test('a heading inside a code fence is not a section', async (t) => {
    const prd = PRD + '\n```markdown\n## 13. Open questions\n\n1. Quoted from the template\n```\n';
    assert.equal((await check(t, { 'prd.md': prd })).status, 0);
  });

  test('--ready also requires the status and every readiness box', async (t) => {
    assert.equal((await check(t, {}, ['--ready'])).status, 0);
    const drafting = edit(INDEX, '| **Status** | Ready for engineering |', '| **Status** | In review |');
    const r = await check(t, { 'README.md': drafting }, ['--ready']);
    assert.match(r.stdout, /status is "In review"/);
    const unticked = await check(t, { 'README.md': edit(INDEX, '- [x] No document', '- [ ] No document') }, ['--ready']);
    assert.match(unticked.stdout, /not ticked: No document has open questions/);
    // The product lead runs it before ticking anything.
    assert.equal((await check(t, { 'README.md': drafting })).status, 0);
  });

  test('a directory with no index is not a package', async (t) => {
    const sb = sandbox(t);
    const r = await runNode(CHECK, { args: [sb.root] });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage: check-package\.mjs/);
  });
});

test('the two copies of check-package.mjs are identical', () => {
  // The tech lead runs it from engineering-team, and the plugins can't import each other,
  // so each ships a copy (as with profile.mjs).
  const a = readFileSync(script('design-team', 'check-package.mjs'), 'utf8');
  const b = readFileSync(script('engineering-team', 'check-package.mjs'), 'utf8');
  assert.equal(b.replace(/\r\n/g, '\n'), a.replace(/\r\n/g, '\n'));
});
