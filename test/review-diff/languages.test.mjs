import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchGlob, rulesFor } from '../../.claude/skills/review-diff/lib/languages.mjs';
import { loadLanguages } from '../../.claude/skills/review-diff/lib/rules.mjs';

const cfg = loadLanguages();

test('matchGlob: basename globs match in any folder', () => {
  assert.ok(matchGlob('*.min.js', 'dist/app.min.js'));
  assert.ok(matchGlob('package-lock.json', 'apps/web/package-lock.json'));
  assert.ok(!matchGlob('*.min.js', 'src/admin.js'));
});

test('matchGlob: folder globs match at the root and nested', () => {
  assert.ok(matchGlob('dist/**', 'dist/a/b.js'));
  assert.ok(matchGlob('dist/**', 'packages/web/dist/x.js'));
  assert.ok(!matchGlob('dist/**', 'src/distance.js'));
  assert.ok(matchGlob('bin/Debug/**', 'Api/bin/Debug/net8.0/Api.dll'));
});

test('matchGlob is case-insensitive and accepts Windows separators', () => {
  assert.ok(matchGlob('*.Designer.cs', 'Forms/Main.designer.cs'));
  assert.ok(matchGlob('obj/**', 'src\\Api\\obj\\project.assets.json'));
});

test('rulesFor: .tsx gets general, TypeScript and React rules', () => {
  assert.deepEqual(rulesFor('src/App.tsx', cfg), {
    language: 'typescript',
    ruleFiles: ['general.md', 'typescript.md', 'react.md'],
  });
});

test('rulesFor: unknown extensions get general rules only; lock files are skipped', () => {
  assert.deepEqual(rulesFor('docs/a.md', cfg), { language: null, ruleFiles: ['general.md'] });
  assert.equal(rulesFor('yarn.lock', cfg).skipped.reason, 'generated-or-lockfile');
  assert.equal(rulesFor('api/v1/user.pb.go', cfg).skipped.reason, 'generated-or-lockfile');
});
