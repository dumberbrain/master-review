#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { CliError, EXIT } from '../lib/errors.mjs';
import { validateFindings } from '../lib/findings.mjs';
import { patchBatches, ruleDetails, ruleIndex } from '../lib/digest.mjs';
import { MAX_SUGGESTIONS } from '../lib/findings.mjs';
import { buildMr, loadLocalDiff } from '../lib/merge-request.mjs';
import { renderReview } from '../lib/render.mjs';
import { describeRuleSet, findProjectConfig, loadRuleSet } from '../lib/rules.mjs';

const USAGE = `usage: review.mjs <command> [args]

  parse <file.diff> --out <mr.json> [--platform github|gitlab] [--title <text>] [--config <file>] [--batch-chars <n>]
      also writes rules.md (rule index) and patches/NN.md (numbered patches, riskiest first)
      next to <mr.json>
  rule <RULE-ID> [RULE-ID...] [--config <file>]
  lines <mr.json> [path]
  validate <mr.json> <findings.json> --out <review.json> [--config <file>] [--max-suggestions <n>]
  render <review.json> --out <review.md>
  rules [--config <file>]

--config: the project's rule config; default ./review.config.json when it exists.

exit codes: 0 ok, 1 invalid input`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help') flags.help = true;
    else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i];
    else positional.push(a);
  }
  return { positional, flags };
}

function need(value, name) {
  if (value === undefined || value === '') throw new CliError(`missing ${name}\n\n${USAGE}`, EXIT.INPUT);
  return value;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new CliError(`cannot read JSON ${p}: ${e.message}`, EXIT.INPUT);
  }
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(p, content);
}

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function ranges(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j] + 1) j++;
    out.push(i === j ? `${lines[i]}` : `${lines[i]}-${lines[j]}`);
    i = j;
  }
  return out.join(', ');
}

const commands = {
  parse({ positional, flags }) {
    const diffPath = need(positional[0], '<file.diff>');
    const out = need(flags.out, '--out <mr.json>');
    const platform = flags.platform ?? 'github';
    if (!['github', 'gitlab'].includes(platform)) throw new CliError(`invalid --platform ${platform}`, EXIT.INPUT);
    if (!fs.existsSync(diffPath)) throw new CliError(`diff file not found: ${diffPath}`, EXIT.INPUT);
    const raw = loadLocalDiff(diffPath, { platform, title: flags.title });
    if (raw.files.length === 0) {
      throw new CliError(`${diffPath} is not a unified git diff (no "diff --git a/... b/..." headers found)`, EXIT.INPUT);
    }
    const ruleSet = loadRuleSet({ projectConfig: findProjectConfig(flags.config) });
    const mr = { ...buildMr(raw, ruleSet), ruleConfig: ruleSet.projectConfig };
    writeFile(out, JSON.stringify(mr, null, 2));
    const reviewable = mr.files.filter((f) => !f.skipped);
    const work = path.dirname(out);
    const rel = (...p) => path.join(work, ...p).replace(/\\/g, '/');
    const index = ruleIndex(ruleSet, [...new Set(reviewable.flatMap((f) => f.ruleFiles))]);
    writeFile(rel('rules.md'), index.text);
    const patchDir = rel('patches');
    if (fs.existsSync(patchDir)) {
      for (const name of fs.readdirSync(patchDir)) if (/^\d+\.md$/.test(name)) fs.rmSync(path.join(patchDir, name));
    }
    const maxChars = flags['batch-chars'] ? Number(flags['batch-chars']) : undefined;
    if (maxChars !== undefined && !(maxChars > 0)) throw new CliError('--batch-chars must be a positive number', EXIT.INPUT);
    const batches = patchBatches(mr.files, ruleSet, maxChars).map((b, i) => {
      const file = rel('patches', `${String(i + 1).padStart(2, '0')}.md`);
      writeFile(file, b.text);
      return { file, files: b.files };
    });
    const summary = {
      config: ruleSet.projectConfig,
      packs: Object.values(ruleSet.packs).filter((p) => p.enabled).map((p) => p.name),
      disabledPacks: Object.values(ruleSet.packs).filter((p) => !p.enabled).map((p) => p.name),
      index: rel('rules.md'),
      indexedRules: index.rules,
    };
    if (Object.keys(ruleSet.overrides).length) summary.overrides = ruleSet.overrides;
    print({
      platform: mr.platform,
      title: mr.title,
      files: mr.files.length,
      skipped: mr.files.length - reviewable.length,
      rules: summary,
      batches,
      risk: Object.fromEntries(reviewable.filter((f) => f.risk.length).map((f) => [f.path, f.risk.join(', ')])),
      skippedFiles: mr.files.filter((f) => f.skipped).map((f) => ({ path: f.path, reason: f.skipped.reason })),
    });
  },

  lines({ positional }) {
    const mr = readJson(need(positional[0], '<mr.json>'));
    const only = positional[1];
    const out = {};
    for (const f of mr.files) {
      if (f.skipped || (only && f.path !== only)) continue;
      out[f.path] = { ranges: ranges(f.validLines), hunks: f.hunks, validLines: f.validLines };
    }
    if (only && !out[only]) throw new CliError(`no reviewable file ${only} in ${positional[0]}`, EXIT.INPUT);
    print(out);
  },

  validate({ positional, flags }) {
    const mr = readJson(need(positional[0], '<mr.json>'));
    const findings = readJson(need(positional[1], '<findings.json>'));
    const out = need(flags.out, '--out <review.json>');
    // The config recorded at parse time, so parse and validate see the same rules.
    const projectConfig = flags.config ? findProjectConfig(flags.config) : (mr.ruleConfig ?? null);
    const maxSuggestions = flags['max-suggestions'] === undefined ? MAX_SUGGESTIONS : Number(flags['max-suggestions']);
    if (!Number.isInteger(maxSuggestions) || maxSuggestions < 0) throw new CliError('--max-suggestions must be a whole number >= 0', EXIT.INPUT);
    const { invalid, report } = validateFindings(mr, findings, loadRuleSet({ projectConfig }), { mode: 'file', maxSuggestions });
    const counts = {
      pending: report.findings.filter((f) => f.status === 'pending' && !f.general).length,
      general: report.findings.filter((f) => f.general).length,
      unmapped: report.findings.filter((f) => f.status === 'unmapped').map((f) => ({ path: f.path, line: f.line, ruleId: f.ruleId, error: f.error })),
      dropped: report.dropped.map((f) => ({ path: f.path, line: f.line, ruleId: f.ruleId, reason: f.dropReason })),
      invalid,
    };
    print(counts);
    if (invalid.length) {
      process.exitCode = EXIT.INPUT;
      return;
    }
    writeFile(out, JSON.stringify(report, null, 2));
  },

  rule({ positional, flags }) {
    if (!positional.length) need(undefined, '<RULE-ID>');
    const { rules, unknown } = ruleDetails(loadRuleSet({ projectConfig: findProjectConfig(flags.config) }), positional);
    print(unknown.length ? { rules, unknown } : rules);
    if (unknown.length) process.exitCode = EXIT.INPUT;
  },

  rules({ flags }) {
    const d = describeRuleSet(loadRuleSet({ projectConfig: findProjectConfig(flags.config) }));
    print(d);
    if (d.problems.length) process.exitCode = EXIT.INPUT;
  },

  render({ positional, flags }) {
    const report = readJson(need(positional[0], '<review.json>'));
    const out = need(flags.out, '--out <review.md>');
    writeFile(out, renderReview(report));
    print({ written: path.resolve(out), findings: report.findings.length });
  },
};

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [cmd, ...rest] = positional;
  if (!cmd || flags.help || !commands[cmd]) {
    process.stdout.write(`${USAGE}\n`);
    process.exitCode = cmd && !commands[cmd] ? EXIT.INPUT : EXIT.OK;
    return;
  }
  commands[cmd]({ positional: rest, flags });
}

try {
  main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`review-diff: ${e instanceof CliError ? e.message : e?.message ?? e}\n`);
  process.exitCode = e instanceof CliError ? e.exitCode : EXIT.INPUT;
}
