import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMr, parseGitDiff, readQuoted } from '../../.claude/skills/review-diff/lib/merge-request.mjs';
import { loadRuleSet } from '../../.claude/skills/review-diff/lib/rules.mjs';

const GENERAL = ['refactoring-guru/general.md', 'owasp/general.md'];
const JS_FILES = [...GENERAL, 'refactoring-guru/javascript.md', 'patterns-dev/javascript.md', 'bulletproof-react/javascript.md'];
const TS_FILES = [...GENERAL, 'refactoring-guru/typescript.md', 'patterns-dev/typescript.md', 'bulletproof-react/typescript.md'];
const CS_FILES = [...GENERAL, 'refactoring-guru/csharp.md', 'dotnet-practices/csharp.md'];
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
  const mr = buildMr({ platform: 'github', files: parseGitDiff(SAMPLE_DIFF) }, loadRuleSet());
  const byPath = Object.fromEntries(mr.files.map((f) => [f.path, f]));
  assert.deepEqual(byPath['src/a.js'].ruleFiles, JS_FILES);
  assert.deepEqual(byPath['src/a.js'].validLines, [1, 2]);
  assert.deepEqual(byPath['new.ts'].ruleFiles, TS_FILES);
  assert.deepEqual(byPath['to.cs'].ruleFiles, CS_FILES);
  assert.equal(byPath['old.go'].skipped.reason, 'deleted');
  assert.match(byPath['logo.png'].skipped.reason, /no-patch/);
  assert.equal(byPath['yarn.lock'].skipped.reason, 'generated-or-lockfile');
});

// git quotes paths with non-ASCII characters (core.quotePath), e.g. Azerbaijani file names.
// "s\311\231b\311\231t.js" is the UTF-8 encoding of "səbət.js".
const Q = String.raw`"a/s\311\231b\311\231t.js"`;
const QB = String.raw`"b/s\311\231b\311\231t.js"`;
const QPATH = String.raw`"s\311\231b\311\231t.js"`;
const QSAY = String.raw`"b/say \"hi\"\tnow.md"`;

test('parseGitDiff decodes quoted non-ASCII paths and keeps each file separate', () => {
  const diff = lines(
    'diff --git a/x.js b/x.js',
    '--- a/x.js',
    '+++ b/x.js',
    '@@ -1 +1,2 @@',
    ' a',
    '+b',
    `diff --git ${Q} ${QB}`,
    `--- ${Q}`,
    `+++ ${QB}`,
    '@@ -1 +1,2 @@',
    ' c',
    '+d',
  );
  const files = parseGitDiff(diff);
  assert.deepEqual(
    files.map((f) => [f.path, f.changeType, f.patch]),
    [
      ['x.js', 'modified', ['@@ -1 +1,2 @@', ' a', '+b'].join('\n')],
      ['səbət.js', 'modified', ['@@ -1 +1,2 @@', ' c', '+d'].join('\n')],
    ],
  );
});

test('parseGitDiff handles quoted renames, mixed quoting and escaped characters', () => {
  const diff = lines(
    `diff --git a/old.js ${QB}`,
    'similarity index 95%',
    'rename from old.js',
    `rename to ${QPATH}`,
    '--- a/old.js',
    `+++ ${QB}`,
    '@@ -1 +1 @@',
    '-a',
    '+b',
    `diff --git ${QSAY.replace('"b/', '"a/')} ${QSAY}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ ${QSAY}`,
    '@@ -0,0 +1 @@',
    '+hi',
  );
  const files = parseGitDiff(diff);
  assert.deepEqual(
    files.map((f) => [f.path, f.oldPath, f.changeType]),
    [
      ['səbət.js', 'old.js', 'renamed'],
      ['say "hi"\tnow.md', undefined, 'added'],
    ],
  );
});

test('parseGitDiff: plain paths with spaces (trailing tab on ---/+++) and deleted files', () => {
  const diff = lines(
    'diff --git a/my docs/a b.md b/my docs/a b.md',
    '--- a/my docs/a b.md\t',
    '+++ b/my docs/a b.md\t',
    '@@ -1 +1 @@',
    '-x',
    '+y',
    `diff --git ${Q} ${QB}`,
    'deleted file mode 100644',
    `--- ${Q}`,
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-gone',
  );
  assert.deepEqual(
    parseGitDiff(diff).map((f) => [f.path, f.changeType]),
    [
      ['my docs/a b.md', 'modified'],
      ['səbət.js', 'deleted'],
    ],
  );
});

test('parseGitDiff: an unrecognised header never leaks hunks into the previous file', () => {
  const diff = lines(
    'diff --git a/x.js b/x.js',
    '--- a/x.js',
    '+++ b/x.js',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    'diff --git x.js y.js',
    '--- x.js',
    '+++ y.js',
    '@@ -1 +1 @@',
    '-c',
    '+d',
  );
  const files = parseGitDiff(diff);
  assert.deepEqual(
    files.map((f) => [f.path, f.patch]),
    [
      ['x.js', ['@@ -1 +1 @@', '-a', '+b'].join('\n')],
      ['y.js', ['@@ -1 +1 @@', '-c', '+d'].join('\n')],
    ],
  );
});

test('readQuoted decodes octal UTF-8 bytes and C escapes', () => {
  assert.deepEqual(readQuoted(String.raw`"a\303\274b" rest`), { value: 'aüb', end: 12 });
  assert.equal(readQuoted(String.raw`"tab\there\\"`).value, 'tab\there\\');
  assert.equal(readQuoted('"plain ə"').value, 'plain ə');
});
