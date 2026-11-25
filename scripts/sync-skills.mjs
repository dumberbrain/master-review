#!/usr/bin/env node
// `.claude/skills/` is the single source of truth for every skill in this repo.
//
// This script
//   1. copies the files review-repo shares with review-diff (rule files and common libs)
//      from review-diff into review-repo, so each skill folder stays self-contained and can
//      be copied into another repository on its own;
//   2. mirrors every `.claude/skills/<name>/` into `.junie/skills/<name>/` (extra files in the
//      mirror are deleted; skills that exist only in the mirror are left alone).
//
// usage: node scripts/sync-skills.mjs [--check]
//   --check  report what is out of sync without writing anything (exit 1 when out of sync)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE = '.claude/skills';
const MIRRORS = ['.junie/skills'];

// Paths (files or folders) copied from one skill into another. Files that exist only in the
// target (e.g. review-repo/rules/repo.md) are kept.
const SHARED = [
  {
    from: 'review-diff',
    to: 'review-repo',
    paths: ['lib/errors.mjs', 'lib/languages.mjs', 'lib/rules.mjs', 'rules'],
  },
];

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  if (fs.statSync(dir).isFile()) return [''];
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(p);
    }
  };
  walk('');
  return out.sort();
}

function sameContent(a, b) {
  return fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
}

function join(base, rel) {
  return rel ? path.join(base, rel) : base;
}

// Copies every file under `from` to the same relative place under `to`.
// With `exact`, files under `to` that do not exist under `from` are deleted.
function planCopy(root, from, to, { exact }) {
  const src = path.join(root, from);
  const dst = path.join(root, to);
  const changes = [];
  const srcFiles = listFiles(src);
  for (const rel of srcFiles) {
    const s = join(src, rel);
    const d = join(dst, rel);
    if (!sameContent(s, d)) changes.push({ action: fs.existsSync(d) ? 'update' : 'create', from: s, to: d });
  }
  if (exact) {
    const keep = new Set(srcFiles);
    for (const rel of listFiles(dst)) if (!keep.has(rel)) changes.push({ action: 'delete', to: join(dst, rel) });
  }
  return changes;
}

export function planShared(root) {
  const changes = [];
  for (const s of SHARED) {
    const fromSkill = path.posix.join(SOURCE, s.from);
    const toSkill = path.posix.join(SOURCE, s.to);
    if (!fs.existsSync(path.join(root, fromSkill)) || !fs.existsSync(path.join(root, toSkill))) continue;
    for (const p of s.paths) {
      changes.push(...planCopy(root, path.posix.join(fromSkill, p), path.posix.join(toSkill, p), { exact: false }));
    }
  }
  return changes;
}

export function planMirrors(root) {
  const changes = [];
  const src = path.join(root, SOURCE);
  if (!fs.existsSync(src)) return changes;
  const skills = fs.readdirSync(src, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const mirror of MIRRORS) {
    for (const skill of skills) {
      changes.push(...planCopy(root, path.posix.join(SOURCE, skill), path.posix.join(mirror, skill), { exact: true }));
    }
  }
  return changes;
}

export function apply(changes) {
  for (const c of changes) {
    if (c.action === 'delete') {
      fs.rmSync(c.to);
    } else {
      fs.mkdirSync(path.dirname(c.to), { recursive: true });
      fs.copyFileSync(c.from, c.to);
    }
  }
}

// Shared copies are applied before the mirrors are planned, so the mirrors pick them up.
export function sync(root, { check = false } = {}) {
  const shared = planShared(root);
  if (check) return [...shared, ...planMirrors(root)];
  apply(shared);
  const mirrors = planMirrors(root);
  apply(mirrors);
  return [...shared, ...mirrors];
}

function main() {
  const check = process.argv.includes('--check');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const changes = sync(root, { check });
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  for (const c of changes) process.stdout.write(`${check ? 'out of sync' : c.action}: ${rel(c.to)}\n`);
  if (changes.length === 0) process.stdout.write('skills are in sync\n');
  else if (check) {
    process.stdout.write('\nrun `npm run sync` (edit skills only under .claude/skills/, and shared files only in review-diff)\n');
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
