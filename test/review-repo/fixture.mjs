import { lines, tempDir, writeTree } from '../helpers.mjs';

// Secret-looking values are assembled at runtime so this file never contains one.
export const FAKE_PASSWORD = ['hunter', '2xyz'].join('');
export const FAKE_AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

export function fixtureRepo(t) {
  const dir = tempDir(t);
  writeTree(dir, {
    'package.json': '{ "name": "demo", "dependencies": { "express": "^4.0.0" } }\n',
    'src/index.js': lines(
      "const express = require('express');",
      `const password = "${FAKE_PASSWORD}";`,
      '// TODO: validate input',
      'if (a == b) start();',
    ),
    'src/util.js': lines('export const add = (a, b) => a + b;'),
    'src/util.test.js': lines("test('add', () => {});"),
    'src/App.tsx': lines('export function App() { return null; }'),
    'config/aws.yml': `key: ${FAKE_AWS}\n`,
    '.env': 'API_KEY=abc\n',
    '.env.example': 'API_KEY=\n',
    'dist/bundle.js': 'minified();\n',
    'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
    '.claude/skills/review-repo/SKILL.md': '# the tool itself\n',
    'repo-review.md': '# previous report\n',
  });
  return dir;
}
