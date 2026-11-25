import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIFF_SKILL = path.join(ROOT, '.claude', 'skills', 'review-diff');
export const REPO_SKILL = path.join(ROOT, '.claude', 'skills', 'review-repo');
export const CHANGE_SKILL = path.join(ROOT, '.claude', 'skills', 'review-change');

export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-review-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes { 'rel/path': content } under dir; Buffer content is written as-is.
export function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

export function runNode(script, args, opts = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', ...opts });
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export function lines(...l) {
  return `${l.join('\n')}\n`;
}
