import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DIFF_SKILL, lines, runNode, tempDir } from '../helpers.mjs';

const CLI = path.join(DIFF_SKILL, 'bin', 'review.mjs');

const diff = lines(
  'diff --git a/src/a.js b/src/a.js',
  '--- a/src/a.js',
  '+++ b/src/a.js',
  '@@ -1 +1,2 @@',
  ' const a = 1;',
  '+if (a == "1") run();',
);

test('parse → validate → render writes review.md', (t) => {
  const dir = tempDir(t);
  const p = (name) => path.join(dir, name);
  fs.writeFileSync(p('in.diff'), diff);

  const parse = runNode(CLI, ['parse', p('in.diff'), '--out', p('mr.json'), '--platform', 'gitlab', '--title', 'Demo']);
  assert.equal(parse.status, 0, parse.stderr);
  assert.deepEqual(parse.json.reviewable, [{ path: 'src/a.js', ruleFiles: ['general.md', 'javascript.md'], lines: '1-2' }]);

  fs.writeFileSync(
    p('findings.json'),
    JSON.stringify([
      { path: 'src/a.js', line: 2, ruleId: 'JS-001', title: 'Loose equality', body: 'Use `===`.', suggestion: 'if (a === 1) run();' },
    ]),
  );
  const validate = runNode(CLI, ['validate', p('mr.json'), p('findings.json'), '--out', p('review.json')]);
  assert.equal(validate.status, 0, validate.stdout);
  assert.equal(validate.json.pending, 1);

  const render = runNode(CLI, ['render', p('review.json'), '--out', p('review.md')]);
  assert.equal(render.status, 0, render.stderr);
  const md = fs.readFileSync(p('review.md'), 'utf8');
  assert.match(md, /^# Code Review — Demo/);
  assert.match(md, /\| Platform \| GitLab \|/);
  assert.match(md, /JS-001 — Loose equality · line 2/);
  assert.match(md, /```suggestion:-0\+0\nif \(a === 1\) run\(\);\n```/);
});

test('parse rejects text that is not a git diff', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'x.diff'), 'just some text\n');
  const r = runNode(CLI, ['parse', path.join(dir, 'x.diff'), '--out', path.join(dir, 'mr.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a unified git diff/);
  assert.ok(!fs.existsSync(path.join(dir, 'mr.json')));
});

test('validate exits 1 and writes nothing when a finding is invalid', (t) => {
  const dir = tempDir(t);
  const p = (name) => path.join(dir, name);
  fs.writeFileSync(p('in.diff'), diff);
  runNode(CLI, ['parse', p('in.diff'), '--out', p('mr.json')]);
  fs.writeFileSync(p('findings.json'), JSON.stringify([{ path: 'src/a.js', line: 2, ruleId: 'NOPE-1', title: 't', body: 'b' }]));
  const r = runNode(CLI, ['validate', p('mr.json'), p('findings.json'), '--out', p('review.json')]);
  assert.equal(r.status, 1);
  assert.match(r.json.invalid[0].error, /unknown ruleId NOPE-1/);
  assert.ok(!fs.existsSync(p('review.json')));
});
