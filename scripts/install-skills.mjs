#!/usr/bin/env node
// Installs the review skills into another repository (or your home folder) for one or more
// agents. Each skill folder is self-contained, so this is a plain copy of
// `.claude/skills/<skill>/` into the agent's skills folder; a re-run updates the copy.
//
// usage: node scripts/install-skills.mjs --target <repo> [--agents claude,agents,junie]
//                                        [--skills review-diff,review-repo] [--dry-run]
//        node scripts/install-skills.mjs --user [--agents claude,agents] [--dry-run]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { apply, planCopy, SOURCE } from './sync-skills.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Skill folder per agent family. `agents` is the cross-agent folder from the Agent Skills
// convention, read by OpenAI Codex, GitHub Copilot, Gemini CLI and Cursor.
export const TARGETS = {
  claude: { project: '.claude/skills', user: '.claude/skills', agents: 'Claude Code' },
  agents: { project: '.agents/skills', user: '.agents/skills', agents: 'Codex, Copilot, Gemini CLI, Cursor' },
  junie: { project: '.junie/skills', user: null, agents: 'JetBrains Junie' },
};
const ALIASES = { codex: 'agents', copilot: 'agents', gemini: 'agents', cursor: 'agents' };
export const DEFAULT_AGENTS = ['claude', 'agents'];

// Report and work files the skills write into the reviewed repository.
export const OUTPUTS = ['.review-comment/', 'review.md', '.review-repo/', 'repo-review.md', '.review-change/', 'repo-review-*.md'];

export function availableSkills(root = ROOT) {
  const dir = path.join(root, SOURCE);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

export function resolveAgents(list) {
  const out = [];
  for (const raw of list) {
    const key = ALIASES[raw] ?? raw;
    if (!TARGETS[key]) throw new Error(`unknown agent "${raw}" (use ${[...Object.keys(TARGETS), ...Object.keys(ALIASES)].join(', ')})`);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Plans the copy of `skills` into `base` (a repository, or the home folder with `user`).
 * Returns [{ agent, folder, changes }]; each skill folder in the target is replaced exactly.
 */
export function planInstall({ base, agents, skills, user = false, root = ROOT }) {
  return agents.map((agent) => {
    const rel = user ? TARGETS[agent].user : TARGETS[agent].project;
    if (!rel) throw new Error(`${TARGETS[agent].agents} has no user-level skills folder; install it per repository with --target`);
    const folder = path.join(base, rel);
    const changes = skills.flatMap((s) => planCopy(path.join(root, SOURCE, s), path.join(folder, s), { exact: true }));
    return { agent, folder, changes };
  });
}

// Outputs not yet ignored by the target's .gitignore (a plain line match, no glob logic).
export function missingIgnores(base) {
  const file = path.join(base, '.gitignore');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
  return OUTPUTS.filter((o) => !lines.includes(o) && !lines.includes(`/${o}`) && !lines.includes(o.replace(/\/$/, '')));
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user' || a === '--dry-run' || a === '--help') flags[a.slice(2)] = true;
    else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i];
    else throw new Error(`unexpected argument ${a}`);
  }
  return flags;
}

const USAGE = `usage: node scripts/install-skills.mjs --target <repo> [--agents ${DEFAULT_AGENTS.join(',')}] [--skills <names>] [--dry-run]
       node scripts/install-skills.mjs --user [--agents ${DEFAULT_AGENTS.join(',')}] [--dry-run]

agents: ${Object.entries(TARGETS)
  .map(([k, v]) => `${k} → ${v.project} (${v.agents})`)
  .join('; ')}
aliases: codex, copilot, gemini, cursor → agents`;

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || (!flags.target && !flags.user) || (flags.target && flags.user)) {
    process.stdout.write(`${USAGE}\n`);
    process.exitCode = flags.help ? 0 : 1;
    return;
  }
  const base = flags.user ? os.homedir() : path.resolve(flags.target);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw new Error(`not a directory: ${base}`);
  if (path.resolve(base) === ROOT) throw new Error('the target is this repository; use `npm run sync` here');
  const agents = resolveAgents((flags.agents ?? DEFAULT_AGENTS.join(',')).split(',').map((s) => s.trim()).filter(Boolean));
  const known = availableSkills();
  const skills = flags.skills ? flags.skills.split(',').map((s) => s.trim()) : known;
  for (const s of skills) if (!known.includes(s)) throw new Error(`unknown skill "${s}" (available: ${known.join(', ')})`);

  const plans = planInstall({ base, agents, skills, user: flags.user });
  for (const p of plans) {
    const verb = flags['dry-run'] ? 'would change' : 'changed';
    process.stdout.write(`${TARGETS[p.agent].agents}: ${p.folder} (${skills.join(', ')}) — ${p.changes.length} file(s) ${verb}\n`);
    for (const c of p.changes) process.stdout.write(`  ${c.action}: ${path.relative(base, c.to).split(path.sep).join('/')}\n`);
    if (!flags['dry-run']) apply(p.changes);
  }
  if (!flags.user) {
    const missing = missingIgnores(base);
    if (missing.length) process.stdout.write(`\nAdd to ${path.join(base, '.gitignore')}:\n${missing.map((m) => `  ${m}`).join('\n')}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`install-skills: ${e.message}\n`);
    process.exitCode = 1;
  }
}
