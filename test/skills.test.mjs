import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { availableSkills } from '../scripts/install-skills.mjs';
import { ROOT } from './helpers.mjs';

// Portability rules from docs/agents.md that can be checked mechanically.
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(m, 'SKILL.md must start with YAML frontmatter');
  return Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .map((l) => /^([\w-]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((x) => [x[1], x[2].trim()]),
  );
}

for (const skill of availableSkills()) {
  test(`${skill}: SKILL.md follows the Agent Skills format`, () => {
    const text = fs.readFileSync(path.join(ROOT, '.claude/skills', skill, 'SKILL.md'), 'utf8');
    const fm = frontmatter(text);
    assert.equal(fm.name, skill, 'name must equal the folder name');
    assert.match(fm.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'name: lowercase letters, digits, single hyphens');
    assert.ok(fm.name.length <= 64);
    assert.ok(fm.description && fm.description.length <= 1024, 'description: 1-1024 characters');
    assert.ok(text.split('\n').length < 500, 'keep SKILL.md under 500 lines');
    if (text.includes('$ARGUMENTS')) {
      assert.match(text, /other\s+agents/,'$ARGUMENTS is Claude-only: also say where other agents get the arguments');
    }
  });

  test(`${skill}: helper code stays inside the skill folder and uses only node: built-ins`, () => {
    const dir = path.join(ROOT, '.claude/skills', skill);
    for (const sub of ['bin', 'lib']) {
      for (const file of fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith('.mjs'))) {
        const src = fs.readFileSync(path.join(dir, sub, file), 'utf8');
        for (const [, spec] of src.matchAll(/^import .* from '([^']+)';$/gm)) {
          const ok = spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../lib/');
          assert.ok(ok, `${sub}/${file} imports "${spec}"`);
        }
      }
    }
  });
}
