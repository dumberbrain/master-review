import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkoutState, patchSides } from '../../.claude/skills/review-change/lib/project.mjs';
import { CHANGE_SKILL, lines, runNode, tempDir, writeTree } from '../helpers.mjs';

const REVIEW = path.join(CHANGE_SKILL, 'bin', 'review.mjs');
const CONTEXT = path.join(CHANGE_SKILL, 'bin', 'context.mjs');

const OLD_TOTAL = '  return items.reduce((s, i) => s + i.price, 0);';
const NEW_TOTAL = '  return items.reduce((s, i) => s + i.price * i.qty, 0);';

const diff = lines(
  'diff --git a/src/orders/service.js b/src/orders/service.js',
  '--- a/src/orders/service.js',
  '+++ b/src/orders/service.js',
  '@@ -1,3 +1,3 @@',
  ' export function total(items) {',
  `-${OLD_TOTAL}`,
  `+${NEW_TOTAL}`,
  ' }',
  'diff --git a/src/new.js b/src/new.js',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/new.js',
  '@@ -0,0 +1 @@',
  '+export const x = 1;',
  'diff --git a/src/old.js b/src/old.js',
  'deleted file mode 100644',
  '--- a/src/old.js',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-export const y = 2;',
  'diff --git a/src/a.js b/src/b.js',
  'similarity index 100%',
  'rename from src/a.js',
  'rename to src/b.js',
);

const common = {
  'README.md': '# Shop\n',
  'docs/agents.md': '# not the root AGENTS.md\n',
  'package.json': '{ "name": "shop" }\n',
  '.github/workflows/ci.yml': 'on: push\n',
  'src/orders/service.test.js': lines("test('total', () => {});"),
};
const service = (body) => lines('export function total(items) {', body, '}');

const HEAD = { ...common, 'src/orders/service.js': service(NEW_TOTAL), 'src/new.js': 'export const x = 1;\n', 'src/b.js': 'b\n' };
const BASE = { ...common, 'src/orders/service.js': service(OLD_TOTAL), 'src/old.js': 'export const y = 2;\n', 'src/a.js': 'b\n' };

// Parses the diff, then runs `context` against a project built from `tree`.
function run(t, tree) {
  const work = tempDir(t);
  const project = tempDir(t);
  writeTree(project, tree);
  const p = (name) => path.join(work, name);
  fs.writeFileSync(p('in.diff'), diff);
  const parse = runNode(REVIEW, ['parse', p('in.diff'), '--out', p('mr.json')]);
  assert.equal(parse.status, 0, parse.stderr);
  const ctx = runNode(CONTEXT, [p('mr.json'), '--project', project, '--out', p('project.json'), '--no-git']);
  assert.equal(ctx.status, 0, ctx.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(p('project.json'), 'utf8')), ctx.json, 'stdout and project.json agree');
  return { ...ctx.json, byPath: Object.fromEntries(ctx.json.changed.map((c) => [c.path, c])) };
}

test('context: project at the PR version is "head" for every changed file', (t) => {
  const ctx = run(t, HEAD);
  assert.equal(ctx.checkout, 'head');
  assert.match(ctx.hint, /read changed files directly/);
  assert.deepEqual(
    ctx.changed.map((c) => [c.path, c.changeType, c.reviewable, c.checkout]),
    [
      ['src/orders/service.js', 'modified', true, 'head'],
      ['src/new.js', 'added', true, 'head'],
      ['src/old.js', 'deleted', false, 'head'],
      ['src/b.js', 'renamed', false, 'head'],
    ],
  );
  assert.equal(ctx.byPath['src/orders/service.js'].lines, 3);
  assert.equal(ctx.byPath['src/b.js'].oldPath, 'src/a.js');
});

test('context: project at the target branch is "base"', (t) => {
  const ctx = run(t, BASE);
  assert.equal(ctx.checkout, 'base');
  assert.match(ctx.hint, /apply each patch/);
  assert.deepEqual(ctx.changed.map((c) => c.checkout), ['base', 'base', 'base', 'base']);
  assert.equal(ctx.byPath['src/new.js'].exists, false);
});

test('context: other content is "differs", a wrong project root is "missing"', (t) => {
  const other = run(t, { ...HEAD, 'src/orders/service.js': service('  return 0;') });
  assert.equal(other.byPath['src/orders/service.js'].checkout, 'differs');
  assert.equal(other.checkout, 'mixed');

  const wrong = run(t, { 'README.md': '# something else\n' });
  assert.equal(wrong.checkout, 'missing');
  assert.match(wrong.hint, /not the repository root/);
});

test('context: structure, files to read first and matching tests', (t) => {
  const ctx = run(t, HEAD);
  assert.equal(ctx.fileSource, 'walk');
  assert.equal(ctx.git, null);
  assert.deepEqual(ctx.totals, { files: 8, testFiles: 1 });
  assert.deepEqual(ctx.structure, {
    rootFiles: 2,
    dirs: [
      { dir: '.github', files: 1 },
      { dir: '.github/workflows', files: 1 },
      { dir: 'docs', files: 1 },
      { dir: 'src', files: 4 },
      { dir: 'src/orders', files: 2 },
    ],
    truncated: false,
  });
  assert.deepEqual(ctx.context, ['README.md', '.github/workflows/ci.yml', 'package.json']);
  assert.deepEqual(ctx.byPath['src/orders/service.js'].tests, ['src/orders/service.test.js']);
  assert.deepEqual(ctx.byPath['src/new.js'].tests, []);
});

test('context: bad input exits 1 with a message', (t) => {
  const work = tempDir(t);
  const noDir = runNode(CONTEXT, [path.join(work, 'mr.json'), '--project', path.join(work, 'nope'), '--out', path.join(work, 'p.json')]);
  assert.equal(noDir.status, 1);
  assert.match(noDir.stderr, /not a directory/);

  fs.writeFileSync(path.join(work, 'mr.json'), '{}');
  const notParsed = runNode(CONTEXT, [path.join(work, 'mr.json'), '--project', work, '--out', path.join(work, 'p.json')]);
  assert.equal(notParsed.status, 1);
  assert.match(notParsed.stderr, /run `review.mjs parse` first/);

  const missing = runNode(CONTEXT, [path.join(work, 'mr.json'), '--out', path.join(work, 'p.json')]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing --project/);
});

test('patchSides and checkoutState compare line by line, ignoring CRLF and trailing spaces', (t) => {
  const patch = ['@@ -2,2 +2,3 @@', ' keep', '-old', '+new', '+more', '\\ No newline at end of file'].join('\n');
  const { oldSide, newSide } = patchSides(patch);
  assert.deepEqual([...oldSide], [[2, 'keep'], [3, 'old']]);
  assert.deepEqual([...newSide], [[2, 'keep'], [3, 'new'], [4, 'more']]);

  const dir = tempDir(t);
  writeTree(dir, { 'a.txt': 'first\r\nkeep  \r\nnew\r\nmore\r\n', 'bin.dat': 'x' });
  assert.equal(checkoutState(dir, { path: 'a.txt', changeType: 'modified', patch }), 'head');
  assert.equal(checkoutState(dir, { path: 'bin.dat', changeType: 'modified', patch: null }), 'unknown');
});
