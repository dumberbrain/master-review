import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRuleSet } from '../../.claude/skills/review-repo/lib/rules.mjs';
import { REPO_PACKS } from '../../.claude/skills/review-repo/lib/repo-findings.mjs';
import { findSecrets, redact, scanRepo } from '../../.claude/skills/review-repo/lib/scan.mjs';
import { lines, tempDir, writeTree } from '../helpers.mjs';
import { FAKE_AWS, FAKE_PASSWORD, fixtureRepo } from './fixture.mjs';

const RULES = loadRuleSet({ extraPacks: REPO_PACKS });
const GENERAL = ['refactoring-guru/general.md', 'owasp/general.md', 'repo/repo.md'];

test('scan builds an inventory with languages, rule files and skip reasons', (t) => {
  const scan = scanRepo(fixtureRepo(t), RULES, { useGit: false, maxFiles: 3 });
  const byPath = Object.fromEntries(scan.files.map((f) => [f.path, f]));

  assert.equal(scan.fileSource, 'walk');
  assert.equal(scan.git, null);
  assert.deepEqual(byPath['src/index.js'].ruleFiles, [...GENERAL, 'refactoring-guru/javascript.md', 'patterns-dev/javascript.md', 'bulletproof-react/javascript.md']);
  assert.equal(byPath['src/index.js'].lines, 4);
  assert.deepEqual(byPath['src/App.tsx'].ruleFiles, [
    ...GENERAL,
    'refactoring-guru/typescript.md',
    'patterns-dev/typescript.md',
    'bulletproof-react/typescript.md',
    'patterns-dev/react.md',
    'bulletproof-react/react.md',
    'react-docs/react.md',
  ]);
  assert.equal(byPath['logo.png'].skipped.reason, 'binary');
  assert.equal(byPath['.claude/skills/review-repo/SKILL.md'].skipped.reason, 'review tooling');
  assert.equal(byPath['repo-review.md'].skipped.reason, 'review output');
  assert.equal(byPath['dist/bundle.js'], undefined, 'build folders are not walked');
  assert.equal(scan.languages.javascript.files, 3);
});

test('scan signals: manifests, lockfiles, tests, CI, sensitive files, secrets, TODOs', (t) => {
  const { signals } = scanRepo(fixtureRepo(t), RULES, { useGit: false });

  assert.equal(signals.readme, null);
  assert.equal(signals.gitignore, false);
  assert.deepEqual(signals.ci, []);
  assert.deepEqual(signals.manifests, [{ path: 'package.json', ecosystem: 'node', lockfile: null }]);
  assert.deepEqual(signals.missingLockfiles, ['package.json']);
  assert.deepEqual(signals.tests, { testFiles: 1, codeFiles: 3 });
  assert.deepEqual(signals.sensitiveFiles, ['.env']);
  assert.deepEqual(
    signals.secretCandidates.map((s) => [s.path, s.line, s.kind]),
    [
      ['config/aws.yml', 1, 'aws-access-key'],
      ['src/index.js', 2, 'assignment'],
    ],
  );
  assert.equal(signals.todos.total, 1);
  assert.deepEqual(signals.todos.files[0], { path: 'src/index.js', count: 1, lines: [3] });
});

test('scan never puts a secret value into its output', (t) => {
  const scan = scanRepo(fixtureRepo(t), RULES, { useGit: false });
  const json = JSON.stringify(scan);
  assert.ok(!json.includes(FAKE_PASSWORD));
  assert.ok(!json.includes(FAKE_AWS));
});

test('scan priority puts entrypoints first and limits to maxFiles; context lists manifests', (t) => {
  const scan = scanRepo(fixtureRepo(t), RULES, { useGit: false, maxFiles: 2 });
  assert.equal(scan.priority.length, 2);
  assert.equal(scan.priority[0].path, 'src/index.js');
  assert.deepEqual(scan.priority[0].reasons, ['entrypoint']);
  assert.ok(scan.context.includes('package.json'));
});

test('scan --path limits the inventory to a sub-folder', (t) => {
  const scan = scanRepo(fixtureRepo(t), RULES, { useGit: false, scope: './src/' });
  assert.equal(scan.scope, 'src');
  assert.ok(scan.files.every((f) => f.path.startsWith('src/')));
  assert.equal(scan.totals.files, 4);
});

test('findSecrets ignores placeholders and redacts values', () => {
  assert.deepEqual(findSecrets('password = "${DB_PASSWORD}"'), []);
  assert.deepEqual(findSecrets('apiKey: "<your-key>"'), []);
  assert.deepEqual(findSecrets('secret = "changeme"'), []);
  assert.deepEqual(findSecrets(`client_secret = '${FAKE_PASSWORD}'`), [{ kind: 'assignment', preview: redact(FAKE_PASSWORD) }]);
  assert.equal(redact('abcdefgh'), 'abcd… (8 chars)');
  assert.deepEqual(findSecrets(['-----BEGIN RSA ', 'PRIVATE KEY-----'].join('')), [{ kind: 'private-key', preview: 'PRIVATE KEY block' }]);
});

test('findSecrets reports every match on a line, also after a placeholder', () => {
  const second = ['AKIA', 'QRSTUVWXYZ012345'].join('');
  assert.deepEqual(
    findSecrets(`keys = ["${FAKE_AWS}", "${second}"]`).map((h) => h.preview),
    [redact(FAKE_AWS), redact(second)],
  );
  assert.deepEqual(findSecrets(`password: "changeme", apiKey: "${FAKE_PASSWORD}"`), [
    { kind: 'assignment', preview: redact(FAKE_PASSWORD) },
  ]);
});

test('scan lists secret candidates of non-test files before test fixtures and reports the total', (t) => {
  const dir = tempDir(t);
  const fixture = Array.from({ length: 120 }, (_, i) => `const user${i} = { password: "${FAKE_PASSWORD}${i}" };`);
  // "__tests__/" sorts before "src/", so before the fix the fixture used up the whole limit.
  writeTree(dir, {
    '__tests__/fixtures.test.js': lines(...fixture),
    'src/config.js': lines(`const password = "${FAKE_PASSWORD}";`),
  });
  const { signals } = scanRepo(dir, RULES, { useGit: false });
  assert.equal(signals.secretCandidates.length, 100);
  assert.deepEqual(signals.secretCandidates[0], { path: 'src/config.js', line: 1, kind: 'assignment', preview: redact(FAKE_PASSWORD) });
  assert.equal(signals.secretCandidatesTotal, 121);
});

test('scan --path finds a workspace lockfile above the scanned sub-folder', (t) => {
  const dir = tempDir(t);
  writeTree(dir, {
    'package.json': '{ "name": "mono", "workspaces": ["packages/*"] }\n',
    'package-lock.json': '{}\n',
    'packages/web/package.json': '{ "name": "web" }\n',
    'packages/web/src/index.js': lines('start();'),
  });
  const { signals } = scanRepo(dir, RULES, { useGit: false, scope: 'packages/web' });
  assert.deepEqual(signals.manifests, [{ path: 'packages/web/package.json', ecosystem: 'node', lockfile: 'package-lock.json' }]);
  assert.deepEqual(signals.missingLockfiles, []);
});

test('scan priority ranks files with language rules above files with only general rules', (t) => {
  const dir = tempDir(t);
  const body = lines('a = 1', 'b = 2', 'c = 3');
  // Same size, no entrypoint, no history: only the language-rules bonus differs.
  // Alphabetical order alone would put a.py first.
  writeTree(dir, { 'a.py': body, 'b.js': body });
  const scan = scanRepo(dir, RULES, { useGit: false });
  assert.deepEqual(scan.priority.map((p) => p.path), ['b.js', 'a.py']);
  assert.deepEqual(scan.priority[1].ruleFiles, GENERAL);
});
