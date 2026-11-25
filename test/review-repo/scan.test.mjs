import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadLanguages } from '../../.claude/skills/review-repo/lib/rules.mjs';
import { findSecrets, redact, scanRepo } from '../../.claude/skills/review-repo/lib/scan.mjs';
import { FAKE_AWS, FAKE_PASSWORD, fixtureRepo } from './fixture.mjs';

test('scan builds an inventory with languages, rule files and skip reasons', (t) => {
  const scan = scanRepo(fixtureRepo(t), loadLanguages(), { useGit: false, maxFiles: 3 });
  const byPath = Object.fromEntries(scan.files.map((f) => [f.path, f]));

  assert.equal(scan.fileSource, 'walk');
  assert.equal(scan.git, null);
  assert.deepEqual(byPath['src/index.js'].ruleFiles, ['general.md', 'javascript.md']);
  assert.equal(byPath['src/index.js'].lines, 4);
  assert.deepEqual(byPath['src/App.tsx'].ruleFiles, ['general.md', 'typescript.md', 'react.md']);
  assert.equal(byPath['logo.png'].skipped.reason, 'binary');
  assert.equal(byPath['.claude/skills/review-repo/SKILL.md'].skipped.reason, 'review tooling');
  assert.equal(byPath['repo-review.md'].skipped.reason, 'review output');
  assert.equal(byPath['dist/bundle.js'], undefined, 'build folders are not walked');
  assert.equal(scan.languages.javascript.files, 3);
});

test('scan signals: manifests, lockfiles, tests, CI, sensitive files, secrets, TODOs', (t) => {
  const { signals } = scanRepo(fixtureRepo(t), loadLanguages(), { useGit: false });

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
  const scan = scanRepo(fixtureRepo(t), loadLanguages(), { useGit: false });
  const json = JSON.stringify(scan);
  assert.ok(!json.includes(FAKE_PASSWORD));
  assert.ok(!json.includes(FAKE_AWS));
});

test('scan priority puts entrypoints first and limits to maxFiles; context lists manifests', (t) => {
  const scan = scanRepo(fixtureRepo(t), loadLanguages(), { useGit: false, maxFiles: 2 });
  assert.equal(scan.priority.length, 2);
  assert.equal(scan.priority[0].path, 'src/index.js');
  assert.deepEqual(scan.priority[0].reasons, ['entrypoint']);
  assert.ok(scan.context.includes('package.json'));
});

test('scan --path limits the inventory to a sub-folder', (t) => {
  const scan = scanRepo(fixtureRepo(t), loadLanguages(), { useGit: false, scope: './src/' });
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
