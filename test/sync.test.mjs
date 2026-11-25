import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { sync } from '../scripts/sync-skills.mjs';
import { ROOT, runNode, tempDir, writeTree } from './helpers.mjs';

test('this repository is in sync (.junie mirrors .claude, review-repo has the shared files)', () => {
  const r = runNode(path.join(ROOT, 'scripts', 'sync-skills.mjs'), ['--check']);
  assert.equal(r.status, 0, `run \`npm run sync\`:\n${r.stdout}`);
});

test('sync copies shared files, mirrors skills exactly and keeps target-only files', (t) => {
  const root = tempDir(t);
  writeTree(root, {
    '.claude/skills/review-diff/SKILL.md': 'diff skill v2',
    '.claude/skills/review-diff/lib/errors.mjs': 'errors',
    '.claude/skills/review-diff/lib/languages.mjs': 'languages',
    '.claude/skills/review-diff/lib/rules.mjs': 'rules',
    '.claude/skills/review-diff/lib/diff.mjs': 'diff only',
    '.claude/skills/review-diff/rules/general.md': 'general v2',
    '.claude/skills/review-repo/SKILL.md': 'repo skill',
    '.claude/skills/review-repo/rules/repo.md': 'repo rules',
    '.claude/skills/review-repo/rules/general.md': 'general v1',
    '.junie/skills/review-diff/SKILL.md': 'diff skill v1',
    '.junie/skills/review-diff/stale.txt': 'old',
    '.junie/skills/other/SKILL.md': 'junie-only skill',
  });
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

  const planned = sync(root, { check: true });
  assert.ok(planned.length > 0);
  assert.equal(read('.junie/skills/review-diff/SKILL.md'), 'diff skill v1', '--check must not write');

  sync(root);
  assert.equal(read('.claude/skills/review-repo/rules/general.md'), 'general v2');
  assert.equal(read('.claude/skills/review-repo/lib/rules.mjs'), 'rules');
  assert.equal(read('.claude/skills/review-repo/rules/repo.md'), 'repo rules');
  assert.ok(!fs.existsSync(path.join(root, '.claude/skills/review-repo/lib/diff.mjs')), 'only shared paths are copied');
  assert.equal(read('.junie/skills/review-diff/SKILL.md'), 'diff skill v2');
  assert.equal(read('.junie/skills/review-repo/rules/general.md'), 'general v2');
  assert.ok(!fs.existsSync(path.join(root, '.junie/skills/review-diff/stale.txt')), 'extra mirror files are deleted');
  assert.equal(read('.junie/skills/other/SKILL.md'), 'junie-only skill', 'mirror-only skills are kept');
  assert.deepEqual(sync(root, { check: true }), []);
});
