import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commentBody, fenceFor, suggestionBlock } from '../../.claude/skills/review-diff/lib/render.mjs';

const f = { path: 'src/a.js', line: 4, status: 'pending', severity: 'minor', ruleId: 'JS-001', title: 'T', body: 'B' };

test('fenceFor is longer than any backtick run in the content', () => {
  assert.equal(fenceFor('plain'), '```');
  assert.equal(fenceFor('a ``` b'), '````');
  assert.equal(fenceFor('x', 4), '````');
});

test('GitHub suggestion block', () => {
  assert.equal(suggestionBlock({ ...f, suggestion: 'x\n' }, 'github'), '```suggestion\nx\n```');
});

test('GitLab suggestion block covers the whole range', () => {
  assert.equal(suggestionBlock({ ...f, startLine: 2, suggestion: 'x' }, 'gitlab'), '```suggestion:-2+0\nx\n```');
  assert.equal(suggestionBlock({ ...f, suggestion: 'x' }, 'gitlab'), '```suggestion:-0+0\nx\n```');
});

test('non drop-in, general and unmapped suggestions become plain code blocks', () => {
  assert.equal(suggestionBlock({ ...f, dropIn: false, suggestion: 'x' }, 'github'), '```javascript\nx\n```');
  assert.equal(suggestionBlock({ ...f, status: 'unmapped', suggestion: 'x' }, 'github'), '```javascript\nx\n```');
  assert.equal(suggestionBlock({ ...f }, 'github'), '');
});

test('commentBody puts severity, rule and title first', () => {
  assert.equal(commentBody(f, 'github'), '**[minor] JS-001 — T**\n\nB');
});
