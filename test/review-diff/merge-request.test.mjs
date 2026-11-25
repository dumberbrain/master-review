import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMr, parseGitDiff } from '../../.claude/skills/review-diff/lib/merge-request.mjs';
import { loadLanguages } from '../../.claude/skills/review-diff/lib/rules.mjs';
import { lines } from '../helpers.mjs';

const SAMPLE_DIFF = lines(
  'diff --git a/src/a.js b/src/a.js',
  'index 111..222 100644',
  '--- a/src/a.js',
  '+++ b/src/a.js',
  '@@ -1 +1,2 @@',
  ' one',
  '+two',
  'diff --git a/new.ts b/new.ts',
  'new file mode 100644',
  'index 000..333',
  '--- /dev/null',
  '+++ b/new.ts',
  '@@ -0,0 +1 @@',
  '+export const x = 1;',
  'diff --git a/old.go b/old.go',
  'deleted file mode 100644',
  'index 444..000',
  '--- a/old.go',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-package old',
  'diff --git a/from.cs b/to.cs',
  'similarity index 90%',
  'rename from from.cs',
  'rename to to.cs',
  'index 555..666 100644',
  '--- a/from.cs',
  '+++ b/to.cs',
  '@@ -1 +1 @@',
  '-class A {}',
  '+class B {}',
  'diff --git a/logo.png b/logo.png',
  'new file mode 100644',
  'index 000..777',
  'Binary files /dev/null and b/logo.png differ',
  'diff --git a/yarn.lock b/yarn.lock',
  '--- a/yarn.lock',
  '+++ b/yarn.lock',
  '@@ -1 +1 @@',
  '-a',
  '+b',
);

test('parseGitDiff detects modified, added, deleted, renamed and binary files', () => {
  const files = parseGitDiff(SAMPLE_DIFF);
  assert.deepEqual(
    files.map((f) => [f.path, f.changeType, f.oldPath]),
    [
      ['src/a.js', 'modified', undefined],
      ['new.ts', 'added', undefined],
      ['old.go', 'deleted', undefined],
      ['to.cs', 'renamed', 'from.cs'],
      ['logo.png', 'added', undefined],
      ['yarn.lock', 'modified', undefined],
    ],
  );
  assert.equal(files[0].patch, ['@@ -1 +1,2 @@', ' one', '+two'].join('\n'));
  assert.equal(files[4].patch, null);
});

test('parseGitDiff accepts CRLF input', () => {
  const files = parseGitDiff(SAMPLE_DIFF.replace(/\n/g, '\r\n'));
  assert.equal(files.length, 6);
  assert.equal(files[0].patch, ['@@ -1 +1,2 @@', ' one', '+two'].join('\n'));
});

test('buildMr attaches rule files and skips deleted, binary and lock files', () => {
  const mr = buildMr({ platform: 'github', files: parseGitDiff(SAMPLE_DIFF) }, loadLanguages());
  const byPath = Object.fromEntries(mr.files.map((f) => [f.path, f]));
  assert.deepEqual(byPath['src/a.js'].ruleFiles, ['general.md', 'javascript.md']);
  assert.deepEqual(byPath['src/a.js'].validLines, [1, 2]);
  assert.deepEqual(byPath['new.ts'].ruleFiles, ['general.md', 'typescript.md']);
  assert.deepEqual(byPath['to.cs'].ruleFiles, ['general.md', 'csharp.md']);
  assert.equal(byPath['old.go'].skipped.reason, 'deleted');
  assert.match(byPath['logo.png'].skipped.reason, /no-patch/);
  assert.equal(byPath['yarn.lock'].skipped.reason, 'generated-or-lockfile');
});

// git quotes paths with non-ASCII characters (core.quotePath), e.g. Azerbaijani file names.
// Today the quoted header is not recognised and the file's hunks are appended to the
// previous file's patch.
test('parseGitDiff handles quoted non-ASCII paths', { todo: 'quoted "a/..." headers are not parsed yet' }, () => {
  const diff = lines(
    'diff --git a/x.js b/x.js',
    '--- a/x.js',
    '+++ b/x.js',
    '@@ -1 +1,2 @@',
    ' a',
    '+b',
    'diff --git "a/s\\311\\231b\\311\\231t.js" "b/s\\311\\231b\\311\\231t.js"',
    '--- "a/s\\311\\231b\\311\\231t.js"',
    '+++ "b/s\\311\\231b\\311\\231t.js"',
    '@@ -1 +1,2 @@',
    ' c',
    '+d',
  );
  const files = parseGitDiff(diff);
  assert.deepEqual(
    files.map((f) => f.path),
    ['x.js', 'səbət.js'],
  );
  assert.equal(files[0].patch, ['@@ -1 +1,2 @@', ' a', '+b'].join('\n'));
});
