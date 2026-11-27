import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { bench } from '../scripts/bench.mjs';
import { lines, ROOT, runNode, tempDir } from './helpers.mjs';

const diff = lines(
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' const a = 1;',
  '+if (a == 1) eval(input);',
  ' export {};',
);

test('bench compares full rule files + mr.json with the rule index + patch batches', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'in.diff'), diff);
  const r = bench(path.join(dir, 'in.diff'));
  assert.equal(r.diff.files, 1);
  assert.ok(r.before.ruleFiles > 0 && r.before.mergeRequestJson > 0);
  assert.ok(r.after.ruleIndex > 0 && r.after.patchBatches > 0);
  assert.ok(r.after.total < r.before.total, 'the lean views are smaller');
  assert.match(r.saving, /^\d+%$/);
});

test('bench CLI prints JSON and exits 1 on a bad diff', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'in.diff'), diff);
  fs.writeFileSync(path.join(dir, 'bad.diff'), 'not a diff\n');
  const script = path.join(ROOT, 'scripts', 'bench.mjs');
  const ok = runNode(script, [path.join(dir, 'in.diff')], { cwd: dir });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.json.diff.files, 1);
  const bad = runNode(script, [path.join(dir, 'bad.diff')], { cwd: dir });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /not a unified git diff/);
});
