import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_SKILL, runNode, tempDir } from '../helpers.mjs';
import { fixtureRepo } from './fixture.mjs';

const CLI = path.join(REPO_SKILL, 'bin', 'review-repo.mjs');

// The skill reviews a repository given by path and writes its work files and report into the
// current working directory, never into the reviewed repository.
test('scan --root reviews another folder; validate and render write here with links to it', (t) => {
  const target = fixtureRepo(t);
  const here = tempDir(t);
  const before = fs.readdirSync(target).sort();
  const run = (args) => runNode(CLI, args, { cwd: here });

  const scan = run(['scan', '--root', target, '--no-git', '--out', '.review-repo/scan.json']);
  assert.equal(scan.status, 0, scan.stderr);
  assert.equal(scan.json.root, path.resolve(target));
  assert.ok(scan.json.priority.some((f) => f.path === 'src/index.js'));

  fs.writeFileSync(
    path.join(here, '.review-repo', 'findings.json'),
    JSON.stringify({
      overview: 'Demo Express app.',
      findings: [{ path: 'src/index.js', line: 4, ruleId: 'JS-001', title: 'Loose equality', body: 'Use `===`.' }],
    }),
  );
  const validate = run(['validate', '.review-repo/scan.json', '.review-repo/findings.json', '--out', '.review-repo/review.json']);
  assert.equal(validate.status, 0, validate.stdout);
  assert.equal(validate.json.findings, 1);

  const name = path.basename(target);
  const render = run(['render', '.review-repo/review.json', '--out', `repo-review-${name}.md`]);
  assert.equal(render.status, 0, render.stderr);

  const md = fs.readFileSync(path.join(here, `repo-review-${name}.md`), 'utf8');
  const rel = path.relative(here, path.join(target, 'src', 'index.js')).split(path.sep).join('/');
  assert.ok(md.includes(`[src/index.js:4](${encodeURI(rel)}#L4)`), 'links point into the reviewed repository');
  assert.ok(md.includes(path.resolve(target)), 'the report names the reviewed path');
  assert.deepEqual(fs.readdirSync(target).sort(), before, 'nothing is written into the reviewed repository');
});

test('scan --root with a path that does not exist exits 1', (t) => {
  const here = tempDir(t);
  const r = runNode(CLI, ['scan', '--root', path.join(here, 'nope'), '--out', 'scan.json'], { cwd: here });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a directory/);
});
