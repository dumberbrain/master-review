import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadRules, parseRuleFile, SEVERITIES, STATUSES } from '../.claude/skills/review-diff/lib/rules.mjs';
import { DIFF_SKILL, REPO_SKILL } from './helpers.mjs';

test('parseRuleFile reads front matter and fields, and ignores headings inside code fences', () => {
  const content = [
    '---',
    'prefix: X',
    '---',
    '# Title',
    '### X-001 — First rule',
    '- **severity**: minor',
    '- **status**: active',
    '```md',
    '### not a rule',
    '- **severity**: blocker',
    '```',
    '### bad heading',
  ].join('\n');
  const r = parseRuleFile(content, 'x.md');
  assert.equal(r.front.prefix, 'X');
  assert.deepEqual(r.rules.map((x) => [x.id, x.title, x.fields]), [['X-001', 'First rule', { severity: 'minor', status: 'active' }]]);
  assert.deepEqual(r.badHeadings, [{ line: 12, text: '### bad heading' }]);
});

// Every rule file shipped with the skills must parse cleanly; this is the "lint" for rule authors.
const ruleSets = [
  { name: 'review-diff', dir: path.join(DIFF_SKILL, 'rules'), extra: [] },
  { name: 'review-repo', dir: path.join(REPO_SKILL, 'rules'), extra: ['repo.md'] },
];

for (const set of ruleSets) {
  test(`${set.name}: rule files are well-formed`, () => {
    const rules = loadRules(set.dir, { extra: set.extra });
    const ids = new Set();
    for (const file of rules.files) {
      assert.deepEqual(file.badHeadings, [], `${file.file}: headings must be "### PREFIX-NNN — Title"`);
      assert.ok(file.front.prefix, `${file.file}: front matter needs a prefix`);
      assert.ok(file.rules.length > 0, `${file.file}: no rules`);
      for (const r of file.rules) {
        const where = `${file.file}:${r.line} ${r.id}`;
        assert.match(r.id, new RegExp(`^${file.front.prefix}-\\d{3}$`), `${where}: id must use the file prefix`);
        assert.ok(!ids.has(r.id), `${where}: duplicate rule id`);
        ids.add(r.id);
        assert.ok(SEVERITIES.includes(r.fields.severity), `${where}: severity must be one of ${SEVERITIES}`);
        assert.ok(STATUSES.includes(r.fields.status), `${where}: status must be one of ${STATUSES}`);
        for (const field of ['look-for', 'why', 'fix']) assert.ok(r.fields[field], `${where}: missing ${field}`);
      }
    }
  });

  test(`${set.name}: languages.json points at existing files with matching prefixes`, () => {
    const rules = loadRules(set.dir, { extra: set.extra });
    for (const [lang, l] of Object.entries(rules.cfg.languages)) {
      assert.ok(fs.existsSync(path.join(set.dir, l.file)), `${lang}: ${l.file} missing`);
      assert.equal(rules.prefixOfFile[l.file], l.prefix, `${lang}: prefix differs from ${l.file} front matter`);
      for (const ext of l.extensions) assert.match(ext, /^\.[a-z0-9]+$/, `${lang}: bad extension ${ext}`);
    }
  });
}
