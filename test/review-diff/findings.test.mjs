import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateFindings } from '../../.claude/skills/review-diff/lib/findings.mjs';
import { buildMr, parseGitDiff } from '../../.claude/skills/review-diff/lib/merge-request.mjs';
import { loadLanguages, loadRules } from '../../.claude/skills/review-diff/lib/rules.mjs';
import { lines } from '../helpers.mjs';

const diff = lines(
  'diff --git a/src/a.js b/src/a.js',
  '--- a/src/a.js',
  '+++ b/src/a.js',
  '@@ -1,1 +1,2 @@',
  ' const a = 1;',
  '+if (a == "1") run();',
  '@@ -9,1 +10,2 @@',
  ' x();',
  '+y();',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '-old',
  '+new',
);
const mr = buildMr({ platform: 'github', files: parseGitDiff(diff) }, loadLanguages());
const rules = loadRules();
const base = { title: 'Loose equality', body: 'Use `===`.' };

function check(findings) {
  return validateFindings(mr, findings, rules, { now: new Date('2026-01-01T00:00:00Z') });
}

test('a finding on a diff line is pending, takes the rule severity and records the code', () => {
  const { invalid, report } = check([{ ...base, path: 'src/a.js', line: 2, ruleId: 'JS-001' }]);
  assert.deepEqual(invalid, []);
  const [f] = report.findings;
  assert.equal(f.status, 'pending');
  assert.equal(f.severity, rules.byId.get('JS-001').severity);
  assert.equal(f.anchorCode, 'if (a == "1") run();');
  assert.match(f.key, /^[0-9a-f]{12}$/);
});

test('unknown rules, rules of another language and bad fields are invalid', () => {
  const { invalid } = check([
    { ...base, path: 'src/a.js', line: 2, ruleId: 'JS-999' },
    { ...base, path: 'src/a.js', line: 2, ruleId: 'CS-001' },
    { ...base, path: 'src/a.js', line: 2, ruleId: 'JS-001', body: '' },
    { ...base, path: 'src/missing.js', line: 2, ruleId: 'JS-001' },
    { ...base, path: 'src/a.js', startLine: 3, line: 2, ruleId: 'JS-001' },
    { ...base, path: 'src/a.js', line: 2, ruleId: 'JS-001', severity: 'critical' },
  ]);
  assert.deepEqual(
    invalid.map((i) => i.index),
    [0, 1, 2, 3, 4, 5],
  );
  assert.match(invalid[0].error, /unknown ruleId/);
  assert.match(invalid[1].error, /does not apply/);
  assert.match(invalid[2].error, /missing body/);
  assert.match(invalid[3].error, /not in the merge request/);
  assert.match(invalid[4].error, /startLine must be <= line/);
  assert.match(invalid[5].error, /invalid severity/);
});

test('lines outside the diff or across hunks are kept as unmapped', () => {
  const { invalid, report } = check([
    { ...base, path: 'src/a.js', line: 5, ruleId: 'JS-001' },
    { ...base, path: 'src/a.js', startLine: 2, line: 10, ruleId: 'JS-001' },
  ]);
  assert.deepEqual(invalid, []);
  assert.deepEqual(
    report.findings.map((f) => f.status),
    ['unmapped', 'unmapped'],
  );
  const byLine = Object.fromEntries(report.findings.map((f) => [f.line, f]));
  assert.match(byLine[5].error, /not part of the diff/);
  assert.match(byLine[10].error, /not inside one diff hunk/);
});

test('general notes need no line; general rules apply to any file', () => {
  const { invalid, report } = check([
    { general: true, path: 'src/a.js', ruleId: 'GEN-011', title: 'No tests', body: 'Add tests.' },
    { ...base, path: 'README.md', line: 1, ruleId: 'GEN-007' },
  ]);
  assert.deepEqual(invalid, []);
  assert.equal(report.findings.length, 2);
  assert.ok(report.findings.every((f) => f.status === 'pending'));
});

test('findings are sorted by file order in the diff, then by line', () => {
  const { report } = check([
    { ...base, path: 'README.md', line: 1, ruleId: 'GEN-007' },
    { ...base, path: 'src/a.js', line: 11, ruleId: 'GEN-006' },
    { ...base, path: 'src/a.js', line: 2, ruleId: 'JS-001' },
  ]);
  assert.deepEqual(
    report.findings.map((f) => `${f.path}:${f.line}`),
    ['src/a.js:2', 'src/a.js:11', 'README.md:1'],
  );
  assert.equal(report.summary.filesReviewed, 2);
});
