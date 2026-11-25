import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { rulesFor } from '../.claude/skills/review-diff/lib/languages.mjs';
import {
  describeRuleSet,
  findProjectConfig,
  lintRuleSet,
  loadRuleSet,
  parseRuleFile,
  PROJECT_CONFIG_FILE,
} from '../.claude/skills/review-diff/lib/rules.mjs';
import { REPO_PACKS } from '../.claude/skills/review-repo/lib/repo-findings.mjs';
import { DIFF_SKILL, REPO_SKILL, tempDir, writeTree } from './helpers.mjs';

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

// Every rule pack shipped with the skills must lint cleanly; this is the "lint" for rule authors.
const ruleSets = [
  { name: 'review-diff', dir: path.join(DIFF_SKILL, 'rules'), extraPacks: {} },
  { name: 'review-repo', dir: path.join(REPO_SKILL, 'rules'), extraPacks: REPO_PACKS },
];

for (const set of ruleSets) {
  test(`${set.name}: every rule pack is well-formed`, () => {
    const rules = loadRuleSet({ rulesDir: set.dir, extraPacks: set.extraPacks });
    const problems = lintRuleSet(rules).map((p) => `${p.file}:${p.line} ${p.message}`);
    assert.deepEqual(problems, []);
    for (const ext of Object.values(rules.languages).flatMap((l) => l.extensions)) assert.match(ext, /^\.[a-z0-9]+$/);
  });

  test(`${set.name}: every folder under rules/packs is a registered pack`, () => {
    const rules = loadRuleSet({ rulesDir: set.dir, extraPacks: set.extraPacks });
    const folders = fs.readdirSync(path.join(set.dir, 'packs')).sort();
    assert.deepEqual(folders, Object.keys(rules.packs).sort(), 'register new packs in rules/config.json');
  });
}

test('the built-in packs keep every rule id that existed before packs (122 language rules + 15 REPO)', () => {
  const rules = loadRuleSet({ rulesDir: path.join(REPO_SKILL, 'rules'), extraPacks: REPO_PACKS });
  const count = (prefix) => [...rules.byId.keys()].filter((id) => id.startsWith(`${prefix}-`)).length;
  assert.deepEqual(
    { GEN: count('GEN'), CS: count('CS'), GO: count('GO'), JAVA: count('JAVA'), JS: count('JS'), TS: count('TS'), REACT: count('REACT'), REPO: count('REPO') },
    { GEN: 20, CS: 20, GO: 16, JAVA: 16, JS: 15, TS: 15, REACT: 20, REPO: 15 },
  );
});

// ---- project config (review.config.json) ----

const RULE = (id, severity = 'minor') =>
  [`### ${id} — Rule ${id}`, `- **severity**: ${severity}`, '- **status**: active', '- **look-for**: x', '- **why**: y', '- **fix**: z', ''].join('\n');
const FILE = (language, prefix, ...ids) => `---\nlanguage: ${language}\nprefix: ${prefix}\n---\n\n# Rules\n\n${ids.map((id) => RULE(id)).join('\n')}`;

function project(t, config, files = {}) {
  const dir = tempDir(t);
  writeTree(dir, { [PROJECT_CONFIG_FILE]: JSON.stringify(config), ...files });
  return path.join(dir, PROJECT_CONFIG_FILE);
}

test('findProjectConfig: explicit path, else review.config.json in cwd, else null', (t) => {
  const cfg = project(t, {});
  assert.equal(findProjectConfig(undefined, path.dirname(cfg)), cfg);
  assert.equal(findProjectConfig('review.config.json', path.dirname(cfg)), cfg);
  assert.equal(findProjectConfig(undefined, tempDir(t)), null);
  assert.throws(() => findProjectConfig('nope.json', tempDir(t)), /config file not found/);
});

test('project config: a disabled pack no longer applies to files, but its rules stay known', (t) => {
  const rules = loadRuleSet({ projectConfig: project(t, { packs: { 'patterns-dev': { enabled: false }, owasp: { enabled: false } } }) });
  assert.deepEqual(rulesFor('src/a.js', rules).ruleFiles, ['refactoring-guru/general.md', 'refactoring-guru/javascript.md', 'bulletproof-react/javascript.md']);
  assert.equal(rules.byId.get('JS-001').packEnabled, false);
  assert.equal(rules.byId.get('GEN-001').packEnabled, true);
});

test('project config: a new pack, a new language, extra skip globs and rule overrides', (t) => {
  const cfg = project(
    t,
    {
      languages: { python: { extensions: ['.py'] } },
      packs: { acme: { title: 'ACME house rules', dir: 'review-rules/acme' } },
      skip: ['legacy/**'],
      rules: { 'GEN-006': { status: 'retired' }, 'JS-001': { severity: 'blocker' } },
    },
    {
      'review-rules/acme/general.md': FILE('general', 'ACME', 'ACME-001'),
      'review-rules/acme/python.md': FILE('python', 'ACME-PY', 'ACME-PY-001', 'ACME-PY-002'),
    },
  );
  const rules = loadRuleSet({ projectConfig: cfg });
  assert.deepEqual(lintRuleSet(rules), []);
  assert.deepEqual(rulesFor('app/main.py', rules), {
    language: 'python',
    ruleFiles: ['refactoring-guru/general.md', 'owasp/general.md', 'acme/general.md', 'acme/python.md'],
  });
  assert.ok(rulesFor('src/a.js', rules).ruleFiles.includes('acme/general.md'));
  assert.equal(rulesFor('legacy/old.js', rules).skipped.reason, 'generated-or-lockfile');
  assert.equal(rules.byId.get('GEN-006').status, 'retired');
  assert.equal(rules.byId.get('JS-001').severity, 'blocker');
  assert.equal(rules.byId.get('ACME-PY-002').file, 'acme/python.md');

  const d = describeRuleSet(rules);
  const acme = d.packs.find((p) => p.name === 'acme');
  assert.equal(acme.origin, 'project');
  assert.equal(acme.activeRules, 3);
});

test('project config errors name the file and the problem', (t) => {
  const bad = (config, files, re) => assert.throws(() => loadRuleSet({ projectConfig: project(t, config, files) }), re);
  bad({ pack: {} }, {}, /unknown key "pack"/);
  bad({ packs: { owasp: { enabled: 'no' } } }, {}, /enabled must be true or false/);
  bad({ packs: { owasp: { dir: 'x' } } }, {}, /already exists .* may only set "enabled"/);
  bad({ packs: { acme: { title: 'no dir' } } }, {}, /a new pack needs "dir"/);
  bad({ packs: { acme: { dir: 'missing' } } }, {}, /folder not found/);
  bad({ packs: { Acme: { dir: 'x' } } }, {}, /pack names use lowercase/);
  bad({ rules: { 'GEN-999': { status: 'retired' } } }, {}, /rules.GEN-999: no such rule/);
  bad({ rules: { 'GEN-001': { severity: 'huge' } } }, {}, /severity must be one of/);
  bad({ rules: { 'GEN-001': { title: 'x' } } }, {}, /unknown key "title"/);
  bad({ languages: { python: { extensions: ['py'] } } }, {}, /extensions must be a non-empty list/);
  bad({ packs: { acme: { dir: 'r' } } }, { 'r/a.md': FILE('general', 'GEN', 'GEN-001') }, /duplicate rule id GEN-001/);
  bad({ packs: { acme: { dir: 'r' } } }, { 'r/a.md': FILE('kotlin', 'KT', 'KT-001') }, /"language: kotlin" must be "general" or a language/);
  bad({ packs: { acme: { dir: 'r' } } }, { 'r/a.md': '# no front matter\n' }, /needs "prefix"/);
});

test('lintRuleSet reports rule problems with file and line', (t) => {
  const cfg = project(t, { packs: { acme: { dir: 'r' } } }, {
    'r/general.md': '---\nlanguage: general\nprefix: ACME\n---\n\n### ACME-1 — Short id\n- **severity**: huge\n- **status**: active\n### bad\n',
  });
  const problems = lintRuleSet(loadRuleSet({ projectConfig: cfg })).map((p) => `${p.file}:${p.line} ${p.message}`);
  assert.deepEqual(problems, [
    'acme/general.md:9 heading must be "### ACME-NNN — Title": ### bad',
    'acme/general.md:6 ACME-1: id must be ACME-NNN (the file\'s prefix and three digits)',
    'acme/general.md:6 ACME-1: severity must be one of blocker, major, minor, suggestion',
    'acme/general.md:6 ACME-1: missing look-for',
    'acme/general.md:6 ACME-1: missing why',
    'acme/general.md:6 ACME-1: missing fix',
  ]);
});
