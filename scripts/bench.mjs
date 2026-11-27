#!/usr/bin/env node
// How much text the agent reads for one review-diff run, compared with reading the full rule
// files and the raw merge-request JSON (what the skill did before the rule index and batches).
//
// usage: node scripts/bench.mjs <file.diff> [--config <file>]
// Prints JSON: bytes and estimated tokens (bytes / 4) for each view and the saving.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, '.claude', 'skills', 'review-diff');
const { loadRuleSet, findProjectConfig } = await import(new URL(`file:///${path.join(SKILL, 'lib', 'rules.mjs').replace(/\\/g, '/')}`));

export function bench(diffPath, { config } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'master-review-bench-'));
  try {
    const mrPath = path.join(work, 'mr.json');
    const r = spawnSync(process.execPath, [path.join(SKILL, 'bin', 'review.mjs'), 'parse', diffPath, '--out', mrPath, ...(config ? ['--config', config] : [])], {
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(r.stderr.trim() || `parse exited ${r.status}`);
    const out = JSON.parse(r.stdout);
    const mr = JSON.parse(fs.readFileSync(mrPath, 'utf8'));
    const ruleSet = loadRuleSet({ projectConfig: findProjectConfig(config) });
    const needed = new Set(mr.files.filter((f) => !f.skipped).flatMap((f) => f.ruleFiles));
    const size = (p) => fs.statSync(p).size;

    const before = {
      ruleFiles: ruleSet.files.filter((f) => needed.has(f.id)).reduce((n, f) => n + size(f.path), 0),
      mergeRequestJson: size(mrPath),
    };
    const after = {
      parseOutput: Buffer.byteLength(r.stdout),
      ruleIndex: size(out.rules.index),
      patchBatches: out.batches.reduce((n, b) => n + size(b.file), 0),
    };
    const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    const tokens = (bytes) => Math.round(bytes / 4);
    const b = total(before);
    const a = total(after);
    return {
      diff: { bytes: size(diffPath), files: out.files, skipped: out.skipped },
      before: { ...before, total: b, tokens: tokens(b) },
      after: { ...after, total: a, tokens: tokens(a) },
      saving: `${Math.round((1 - a / b) * 100)}%`,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  const config = ci >= 0 ? args[ci + 1] : undefined;
  const diff = args.find((a, i) => !a.startsWith('--') && !(ci >= 0 && i === ci + 1));
  if (!diff) {
    process.stderr.write('usage: node scripts/bench.mjs <file.diff> [--config <file>]\n');
    process.exit(1);
  }
  try {
    process.stdout.write(`${JSON.stringify(bench(diff, { config }), null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`bench: ${e.message}\n`);
    process.exit(1);
  }
}
