import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeAt, hunkOf, parsePatch } from '../../.claude/skills/review-diff/lib/diff.mjs';

const patch = ['@@ -1,3 +1,4 @@', ' a', '-b', '+B', '+C', ' d'].join('\n');

test('parsePatch maps added and context lines to new-side line numbers', () => {
  const r = parsePatch(patch);
  assert.deepEqual(r.validLines, [1, 2, 3, 4]);
  assert.deepEqual(r.hunks, [{ newStart: 1, newEnd: 4 }]);
  assert.equal(r.text[2], 'B');
  assert.equal(r.text[4], 'd');
});

test('parsePatch handles several hunks and headers without counts', () => {
  const p = ['@@ -1,2 +1,2 @@', ' x', '-z', '+y', '@@ -10 +10,2 @@', '-old', '+n1', '+n2'].join('\n');
  const r = parsePatch(p);
  assert.deepEqual(r.validLines, [1, 2, 10, 11]);
  assert.deepEqual(r.hunks, [
    { newStart: 1, newEnd: 2 },
    { newStart: 10, newEnd: 11 },
  ]);
  assert.equal(hunkOf(r.hunks, 5), null);
  assert.deepEqual(hunkOf(r.hunks, 11), { newStart: 10, newEnd: 11 });
});

test('parsePatch strips CRLF and ignores "No newline" markers', () => {
  const p = '@@ -1 +1 @@\r\n-a\r\n\\ No newline at end of file\r\n+b\r\n\\ No newline at end of file';
  const r = parsePatch(p);
  assert.deepEqual(r.validLines, [1]);
  assert.equal(r.text[1], 'b');
});

test('parsePatch ignores lines after a hunk is complete', () => {
  const r = parsePatch(['@@ -1 +1 @@', '-a', '+b', 'trailing garbage'].join('\n'));
  assert.deepEqual(r.validLines, [1]);
});

test('codeAt returns the new-side code of a range, or null outside the diff', () => {
  assert.equal(codeAt(patch, 2, 3), 'B\nC');
  assert.equal(codeAt(patch, 1, 5), null);
});
