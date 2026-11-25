import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { availableSkills, missingIgnores, planInstall, resolveAgents } from '../scripts/install-skills.mjs';
import { apply } from '../scripts/sync-skills.mjs';
import { ROOT, runNode, tempDir, writeTree } from './helpers.mjs';

const SCRIPT = path.join(ROOT, 'scripts', 'install-skills.mjs');

test('resolveAgents maps agent names to skill folders and removes duplicates', () => {
  assert.deepEqual(resolveAgents(['claude', 'codex', 'copilot', 'gemini', 'cursor', 'junie']), ['claude', 'agents', 'junie']);
  assert.throws(() => resolveAgents(['vim']), /unknown agent "vim"/);
});

test('availableSkills lists the skills in .claude/skills', () => {
  assert.deepEqual(availableSkills(), ['review-diff', 'review-repo']);
});

test('install copies each skill exactly and a re-run removes stale files', (t) => {
  const repo = tempDir(t);
  writeTree(repo, { '.agents/skills/review-diff/old.txt': 'stale', '.agents/skills/mine/SKILL.md': 'keep' });
  const plans = planInstall({ base: repo, agents: ['claude', 'agents'], skills: ['review-diff'] });
  for (const p of plans) apply(p.changes);

  for (const folder of ['.claude/skills', '.agents/skills']) {
    const skill = path.join(repo, folder, 'review-diff');
    assert.equal(
      fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'),
      fs.readFileSync(path.join(ROOT, '.claude/skills/review-diff/SKILL.md'), 'utf8'),
    );
    assert.ok(fs.existsSync(path.join(skill, 'bin', 'review.mjs')));
  }
  assert.ok(!fs.existsSync(path.join(repo, '.agents/skills/review-diff/old.txt')));
  assert.equal(fs.readFileSync(path.join(repo, '.agents/skills/mine/SKILL.md'), 'utf8'), 'keep', 'other skills are untouched');
  assert.ok(!fs.existsSync(path.join(repo, '.claude/skills/review-repo')), 'only the chosen skills');
  assert.ok(planInstall({ base: repo, agents: ['claude', 'agents'], skills: ['review-diff'] }).every((p) => p.changes.length === 0));
});

test('junie has no user-level folder', () => {
  assert.throws(() => planInstall({ base: '/home/x', agents: ['junie'], skills: ['review-diff'], user: true }), /no user-level/);
});

test('missingIgnores lists report files the target does not ignore yet', (t) => {
  const repo = tempDir(t);
  assert.deepEqual(missingIgnores(repo), ['.review-comment/', 'review.md', '.review-repo/', 'repo-review.md']);
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n/.review-comment/\nreview.md\r\n.review-repo\n');
  assert.deepEqual(missingIgnores(repo), ['repo-review.md']);
});

test('CLI: --dry-run writes nothing; a real run installs; the installed helper works', (t) => {
  const repo = tempDir(t);
  const dry = runNode(SCRIPT, ['--target', repo, '--agents', 'codex', '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Codex, Copilot, Gemini CLI, Cursor: .*would change/);
  assert.ok(!fs.existsSync(path.join(repo, '.agents')));

  const run = runNode(SCRIPT, ['--target', repo, '--agents', 'codex', '--skills', 'review-repo']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Add to .*\.gitignore/);
  const help = runNode(path.join(repo, '.agents/skills/review-repo/bin/review-repo.mjs'), ['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: review-repo\.mjs/);

  const bad = runNode(SCRIPT, ['--target', repo, '--skills', 'nope']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown skill "nope"/);
});
