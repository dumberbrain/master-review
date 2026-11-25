#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { CliError, EXIT } from '../lib/errors.mjs';
import { REPO_PACKS, validateRepoFindings } from '../lib/repo-findings.mjs';
import { renderRepoReview } from '../lib/repo-render.mjs';
import { describeRuleSet, findProjectConfig, GENERAL, loadRuleSet, ruleSetSummary } from '../lib/rules.mjs';
import { scanRepo } from '../lib/scan.mjs';

const USAGE = `usage: review-repo.mjs <command> [args]

  scan [--root <dir>] [--path <subdir>] [--max-files <n>] [--no-git] [--include-tooling] [--config <file>] --out <scan.json>
  validate <scan.json> <findings.json> --out <review.json> [--config <file>]
  render <review.json> --out <repo-review.md>
  rules [--config <file>]

--config: the rule config; default ./review.config.json (current working directory) when it exists.

exit codes: 0 ok, 1 invalid input`;

const BOOLEAN_FLAGS = new Set(['help', 'no-git', 'include-tooling']);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) positional.push(a);
    else if (BOOLEAN_FLAGS.has(a.slice(2))) flags[a.slice(2)] = true;
    else flags[a.slice(2)] = argv[++i];
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

function loadRepoRuleSet(projectConfig) {
  return loadRuleSet({ projectConfig, extraPacks: REPO_PACKS });
}

const commands = {
  scan({ flags }) {
    const out = need(flags.out, '--out <scan.json>');
    const root = path.resolve(flags.root ?? '.');
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new CliError(`not a directory: ${root}`, EXIT.INPUT);
    if (flags.path && !fs.existsSync(path.join(root, flags.path))) throw new CliError(`--path ${flags.path} not found under ${root}`, EXIT.INPUT);
    const maxFiles = flags['max-files'] === undefined ? 40 : Number(flags['max-files']);
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new CliError('--max-files must be a positive integer', EXIT.INPUT);

    const ruleSet = loadRepoRuleSet(findProjectConfig(flags.config));
    const scan = {
      ...scanRepo(root, ruleSet, {
        scope: flags.path,
        maxFiles,
        useGit: !flags['no-git'],
        includeTooling: Boolean(flags['include-tooling']),
      }),
      ruleConfig: ruleSet.projectConfig,
    };
    writeFile(out, JSON.stringify(scan, null, 2));
    const { files, ...summary } = scan;
    // Rule files to load: every general one (repository-wide findings) plus the priority files' ones.
    const general = ruleSet.files.filter((f) => f.enabled && f.language === GENERAL).map((f) => f.id);
    print({ ...summary, rules: ruleSetSummary(ruleSet, [...general, ...scan.priority.flatMap((p) => p.ruleFiles)]) });
  },

  rules({ flags }) {
    const d = describeRuleSet(loadRepoRuleSet(findProjectConfig(flags.config)));
    print(d);
    if (d.problems.length) process.exitCode = EXIT.INPUT;
  },

  validate({ positional, flags }) {
    const scan = readJson(need(positional[0], '<scan.json>'));
    const input = readJson(need(positional[1], '<findings.json>'));
    const out = need(flags.out, '--out <review.json>');
    // The config recorded at scan time, so scan and validate see the same rules.
    const rules = loadRepoRuleSet(flags.config ? findProjectConfig(flags.config) : (scan.ruleConfig ?? null));
    const { invalid, report } = validateRepoFindings(scan, input, rules);
    print({ findings: report.findings.length, bySeverity: report.summary.bySeverity, reviewed: report.reviewed.length, invalid });
    if (invalid.length) {
      process.exitCode = EXIT.INPUT;
      return;
    }
    writeFile(out, JSON.stringify(report, null, 2));
  },

  render({ positional, flags }) {
    const report = readJson(need(positional[0], '<review.json>'));
    const out = need(flags.out, '--out <repo-review.md>');
    writeFile(out, renderRepoReview(report, { outDir: path.dirname(path.resolve(out)) }));
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
  process.stderr.write(`review-repo: ${e instanceof CliError ? e.message : e?.message ?? e}\n`);
  process.exitCode = e instanceof CliError ? e.exitCode : EXIT.INPUT;
}
