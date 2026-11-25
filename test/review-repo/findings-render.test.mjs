import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_RULE_FILE, validateRepoFindings } from '../../.claude/skills/review-repo/lib/repo-findings.mjs';
import { renderRepoReview } from '../../.claude/skills/review-repo/lib/repo-render.mjs';
import { loadLanguages, loadRules } from '../../.claude/skills/review-repo/lib/rules.mjs';
import { scanRepo } from '../../.claude/skills/review-repo/lib/scan.mjs';
import { REPO_SKILL, runNode } from '../helpers.mjs';
import { fixtureRepo } from './fixture.mjs';

const rules = loadRules(path.join(REPO_SKILL, 'rules'), { extra: [REPO_RULE_FILE] });
const NOW = { now: new Date('2026-01-01T00:00:00Z') };
const loose = { path: 'src/index.js', line: 4, ruleId: 'JS-001', title: 'Loose equality', body: 'Use `===`.' };

function setup(t) {
  const root = fixtureRepo(t);
  return { root, scan: scanRepo(root, loadLanguages(), { useGit: false }) };
}

test('valid findings get rule severity, a code snippet and summary counts', (t) => {
  const { scan } = setup(t);
  const { invalid, report } = validateRepoFindings(
    scan,
    {
      overview: 'Demo API.',
      reviewed: ['src/util.js'],
      findings: [
        { ...loose, related: [{ path: 'src/util.js', line: 1 }] },
        { general: true, path: 'package.json', ruleId: 'REPO-002', title: 'Few tests', body: 'Add tests.' },
        { general: true, ruleId: 'REPO-003', title: 'No CI', body: 'Add a pipeline.' },
      ],
    },
    rules,
    NOW,
  );
  assert.deepEqual(invalid, []);
  assert.equal(report.overview, 'Demo API.');
  assert.deepEqual(
    report.findings.map((f) => f.ruleId),
    ['REPO-002', 'REPO-003', 'JS-001'],
    'sorted by severity (major first), then path (repository-wide findings have none)',
  );
  const f = report.findings.find((x) => x.ruleId === 'JS-001');
  assert.equal(f.severity, rules.byId.get('JS-001').severity);
  assert.equal(f.snippet, 'if (a == b) start();');
  assert.deepEqual(report.reviewed, ['src/index.js', 'src/util.js'], 'finding files count as reviewed');
  assert.equal(report.summary.filesReviewed, 2);
  assert.equal(report.summary.byRuleFile['repo.md'], 2);
});

test('invalid findings: unknown path/rule, wrong language, line past EOF, skipped file, duplicates', (t) => {
  const { scan } = setup(t);
  const { invalid } = validateRepoFindings(
    scan,
    {
      reviewed: ['nope.js'],
      findings: [
        { ...loose, path: 'src/missing.js' },
        { ...loose, ruleId: 'JS-999' },
        { ...loose, ruleId: 'CS-001' },
        { ...loose, line: 50 },
        { ...loose, path: 'logo.png', ruleId: 'GEN-007', line: 1 },
        { general: true, ruleId: 'JS-001', title: 't', body: 'b' },
        { ...loose, related: [{ path: 'src/index.js', line: 99 }] },
        loose,
        loose,
      ],
    },
    rules,
    NOW,
  );
  const errors = invalid.map((i) => i.error);
  assert.match(errors[0], /not in the scan/);
  assert.match(errors[1], /unknown ruleId/);
  assert.match(errors[2], /does not apply/);
  assert.match(errors[3], /past the end of src\/index\.js \(4 lines\)/);
  assert.match(errors[4], /was skipped \(binary\)/);
  assert.match(errors[5], /does not apply to a repository-wide finding/);
  assert.match(errors[6], /^related: line 99/);
  assert.match(errors[7], /duplicate of finding #7/);
  assert.match(errors[8], /reviewed path nope\.js/);
  assert.equal(invalid.length, 9);
});

test('render: overview, top issues, links relative to the report, snippets and coverage', (t) => {
  const { scan } = setup(t);
  const { report } = validateRepoFindings(
    scan,
    {
      overview: 'Demo API.',
      findings: [
        { ...loose, suggestion: 'if (a === b) start();' },
        { general: true, ruleId: 'REPO-003', title: 'No CI', body: 'Add a pipeline.' },
      ],
    },
    rules,
    NOW,
  );
  const md = renderRepoReview(report, { outDir: path.join(scan.root, 'docs') });
  assert.match(md, /^# Repository review — /);
  assert.match(md, /## Overview\n\nDemo API\./);
  assert.match(md, /- Findings: blocker 0 · major 0 · minor 2 · suggestion 0/);
  assert.match(md, /## Repository-level findings\n\n#### 1\. \[minor\] REPO-003 — No CI/);
  assert.match(md, /### \[src\/index\.js\]\(\.\.\/src\/index\.js\)/);
  assert.match(md, /\[src\/index\.js:4\]\(\.\.\/src\/index\.js#L4\) · line 4/);
  assert.match(md, /```javascript\nif \(a == b\) start\(\);\n```/);
  assert.match(md, /\*\*Suggested fix\*\*\n\n```javascript\nif \(a === b\) start\(\);\n```/);
  assert.match(md, /High-priority files not reviewed/);
  assert.match(md, /- Manifests: `package\.json` \(node, \*\*no lockfile\*\*\)/);
});

test('CLI: scan → validate → render', (t) => {
  const root = fixtureRepo(t);
  const cli = path.join(REPO_SKILL, 'bin', 'review-repo.mjs');
  const work = (name) => path.join(root, '.review-repo', name);

  const scan = runNode(cli, ['scan', '--root', root, '--no-git', '--max-files', '5', '--out', work('scan.json')]);
  assert.equal(scan.status, 0, scan.stderr);
  assert.equal(scan.json.files, undefined, 'stdout omits the per-file inventory');
  assert.equal(scan.json.priority[0].path, 'src/index.js');

  fs.writeFileSync(work('findings.json'), JSON.stringify({ overview: 'Demo.', findings: [loose] }));
  const validate = runNode(cli, ['validate', work('scan.json'), work('findings.json'), '--out', work('review.json')]);
  assert.equal(validate.status, 0, validate.stdout);
  assert.equal(validate.json.findings, 1);

  const out = path.join(root, 'repo-review.md');
  const render = runNode(cli, ['render', work('review.json'), '--out', out]);
  assert.equal(render.status, 0, render.stderr);
  assert.match(fs.readFileSync(out, 'utf8'), /\[src\/index\.js:4\]\(src\/index\.js#L4\)/);

  fs.writeFileSync(work('findings.json'), JSON.stringify([{ ...loose, line: 0 }]));
  const bad = runNode(cli, ['validate', work('scan.json'), work('findings.json'), '--out', work('review2.json')]);
  assert.equal(bad.status, 1);
  assert.ok(!fs.existsSync(work('review2.json')));
});
