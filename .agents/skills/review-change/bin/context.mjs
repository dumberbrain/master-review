#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { CliError, EXIT } from '../lib/errors.mjs';
import { projectContext } from '../lib/project.mjs';

const USAGE = `usage: context.mjs <mr.json> --project <dir> --out <project.json> [--no-git]

  Describes the project a parsed diff belongs to: structure, files to read first, tests of the
  changed files, and whether the project folder holds the PR version ("head") or the base
  version of each changed file. <mr.json> is the output of \`review.mjs parse\`.

exit codes: 0 ok, 1 invalid input`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '--no-git') flags[a.slice(2)] = true;
    else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i];
    else positional.push(a);
  }
  return { positional, flags };
}

function need(value, name) {
  if (value === undefined || value === '') throw new CliError(`missing ${name}\n\n${USAGE}`, EXIT.INPUT);
  return value;
}

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  if (flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const mrPath = need(positional[0], '<mr.json>');
  const project = path.resolve(need(flags.project, '--project <dir>'));
  const out = need(flags.out, '--out <project.json>');
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new CliError(`not a directory: ${project}`, EXIT.INPUT);

  let mr;
  try {
    mr = JSON.parse(fs.readFileSync(mrPath, 'utf8'));
  } catch (e) {
    throw new CliError(`cannot read JSON ${mrPath}: ${e.message}`, EXIT.INPUT);
  }
  if (!Array.isArray(mr.files)) throw new CliError(`${mrPath} has no files[]: run \`review.mjs parse\` first`, EXIT.INPUT);

  const ctx = projectContext(project, mr, { useGit: !flags['no-git'] });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(ctx, null, 2));
  process.stdout.write(`${JSON.stringify(ctx, null, 2)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`review-change: ${e instanceof CliError ? e.message : e?.message ?? e}\n`);
  process.exitCode = e instanceof CliError ? e.exitCode : EXIT.INPUT;
}
