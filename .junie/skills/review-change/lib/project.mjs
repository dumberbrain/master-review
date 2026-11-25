import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { matchGlob } from './languages.mjs';

// Deterministic facts about the project a diff belongs to: its structure, the files to read
// first, and for every changed file whether the project folder holds the diff's new side
// ("head", the PR branch) or its old side ("base"). Nothing here is a finding on its own.

const MAX_TEXT_BYTES = 1_000_000;
const STRUCTURE_DEPTH = 2;
const MAX_STRUCTURE = 60;
const MAX_CONTEXT = 30;
const MAX_TESTS = 5;

// Used only when the folder is not a git work tree (git ls-files already honours .gitignore).
const WALK_IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'target', 'obj', 'coverage', 'vendor', '.next', '.nuxt',
  '.venv', 'venv', '__pycache__', '.idea', '.vs', '.gradle', '.review-repo', '.review-comment', '.review-change',
]);
const MANIFEST_GLOBS = [
  'package.json', 'go.mod', 'Cargo.toml', 'composer.json', 'Gemfile', 'pyproject.toml', 'Pipfile',
  'requirements*.txt', 'pom.xml', 'build.gradle', 'build.gradle.kts', '*.csproj', '*.sln',
];
const CI_GLOBS = [
  '.github/workflows/*', '.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile', '.circleci/**',
  'bitbucket-pipelines.yml', '.travis.yml', '.drone.yml',
];
const CONFIG_GLOBS = [
  'Dockerfile*', 'docker-compose*.yml', 'docker-compose*.yaml', 'compose.yml', 'compose.yaml',
  'tsconfig*.json', 'appsettings*.json', 'application*.yml', 'application*.properties', '.env.example',
];
// Root-level docs that describe the project and its conventions.
const ROOT_DOCS = /^(readme(\.\w+)?|AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md)$/i;
const TEST_PATTERNS = [
  /(^|\/)(test|tests|__tests__|spec|specs|e2e)\//i,
  /\.(test|spec)\.[^/]+$/i,
  /_test\.(go|py)$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /(Tests?|IT)\.(java|kt|cs)$/,
];

function posix(p) {
  return p.replace(/\\/g, '/');
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function listProjectFiles(root, { useGit = true } = {}) {
  if (useGit) {
    try {
      // -z: paths are NUL-separated and never quoted, so non-ASCII names survive.
      const out = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
      const paths = out.split('\0').filter((p) => p && fs.existsSync(path.join(root, p)));
      return { source: 'git', paths: paths.map(posix) };
    } catch {
      // not a git work tree (or git missing): walk the folder instead
    }
  }
  const paths = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!WALK_IGNORED_DIRS.has(e.name)) walk(p);
      } else if (e.isFile()) paths.push(p);
    }
  };
  walk('');
  return { source: 'walk', paths: paths.sort((a, b) => a.localeCompare(b)) };
}

function gitInfo(root) {
  try {
    return {
      head: git(root, ['rev-parse', '--short', 'HEAD']).trim(),
      branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
      dirty: git(root, ['status', '--porcelain', '--untracked-files=no']).trim() !== '',
    };
  } catch {
    return null;
  }
}

function readLines(abs) {
  try {
    if (!fs.statSync(abs).isFile() || fs.statSync(abs).size > MAX_TEXT_BYTES) return null;
    const text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    if (text.endsWith('\n')) lines.pop();
    return lines;
  } catch {
    return null;
  }
}

// Old-side and new-side lines of a patch, keyed by line number.
export function patchSides(patch) {
  const oldSide = new Map();
  const newSide = new Map();
  let oldLine = 0;
  let newLine = 0;
  for (const line of (patch ?? '').split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) {
      oldLine = Number(h[1]);
      newLine = Number(h[2]);
    } else if (line.startsWith('+')) newSide.set(newLine++, line.slice(1));
    else if (line.startsWith('-')) oldSide.set(oldLine++, line.slice(1));
    else if (line.startsWith(' ')) {
      oldSide.set(oldLine++, line.slice(1));
      newSide.set(newLine++, line.slice(1));
    }
  }
  return { oldSide, newSide };
}

function matches(fileLines, side) {
  if (!fileLines || side.size === 0) return false;
  for (const [n, text] of side) {
    if ((fileLines[n - 1] ?? null)?.trimEnd() !== text.trimEnd()) return false;
  }
  return true;
}

/**
 * Which side of the diff the project folder holds for one changed file:
 * "head" (new side, the PR branch), "base" (old side), "missing" (neither file exists),
 * "differs" (the file matches neither side: another commit or local edits) or "unknown"
 * (the diff has no line content to compare, e.g. a binary file).
 */
export function checkoutState(root, file) {
  const type = file.changeType;
  const newLines = type === 'deleted' ? null : readLines(path.join(root, file.path));
  const oldLines = type === 'added' ? null : readLines(path.join(root, file.oldPath ?? file.path));
  if (!newLines && !oldLines) {
    if (type === 'deleted') return 'head';
    return type === 'added' ? 'base' : 'missing';
  }

  const { oldSide, newSide } = patchSides(file.patch);
  if (oldSide.size === 0 && newSide.size === 0) {
    // Nothing to compare line by line: decide by which path exists.
    if (type === 'renamed') return newLines ? 'head' : 'base';
    if (type === 'added') return 'head';
    if (type === 'deleted') return 'base';
    return 'unknown';
  }
  if (matches(newLines, newSide)) return 'head';
  if (matches(oldLines, oldSide)) return 'base';
  return 'differs';
}

function overall(states) {
  const set = new Set(states);
  if (set.size === 0) return 'unknown';
  if (set.size === 1) return states[0];
  return 'mixed';
}

const HINTS = {
  head: 'The project folder holds the PR version of every changed file: read changed files directly.',
  base: 'The project folder holds the base version (before the PR): apply each patch in your head when reading a changed file; unchanged files are current.',
  mixed: 'Some changed files are at the PR version and some are not: check `checkout` per file before trusting what you read.',
  differs: 'The changed files match neither side of the diff (other commit or local edits): use the patch as the truth for changed lines and the project only for surrounding code.',
  missing: 'None of the changed files exist in the project folder: the project path is probably not the repository root the diff paths are relative to.',
  unknown: 'The diff has no changed lines to compare with the project (binary files or no reviewable files).',
};

function testName(p) {
  const base = p.split('/').pop().replace(/\.[^.]+$/, '');
  return base
    .replace(/\.(test|spec)$/i, '')
    .replace(/_test$/i, '')
    .replace(/^test_/i, '')
    .replace(/(Tests?|IT)$/, '')
    .toLowerCase();
}

function stem(p) {
  return p.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
}

function testsFor(changedPath, testFiles) {
  const s = stem(changedPath);
  return testFiles.filter((t) => t !== changedPath && testName(t) === s).slice(0, MAX_TESTS);
}

function structure(paths) {
  const counts = new Map();
  for (const p of paths) {
    const parts = p.split('/').slice(0, -1);
    for (let d = 1; d <= Math.min(parts.length, STRUCTURE_DEPTH); d++) {
      const dir = parts.slice(0, d).join('/');
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  const rootFiles = paths.filter((p) => !p.includes('/')).length;
  const dirs = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, MAX_STRUCTURE)
    .map(([dir, files]) => ({ dir, files }));
  return { rootFiles, dirs, truncated: counts.size > MAX_STRUCTURE };
}

// Shallow files first: in a monorepo the root manifest and config explain the most.
function contextFiles(paths) {
  const depth = (p) => p.split('/').length;
  const pick = (test) => paths.filter(test).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  const docs = pick((p) => ROOT_DOCS.test(p));
  const ci = pick((p) => CI_GLOBS.some((g) => matchGlob(g, p)));
  const config = pick((p) => CONFIG_GLOBS.some((g) => matchGlob(g, p)));
  const manifests = pick((p) => MANIFEST_GLOBS.some((g) => matchGlob(g, p)));
  return [...new Set([...docs, ...ci, ...config, ...manifests])].slice(0, MAX_CONTEXT);
}

/**
 * Describes `root` (the repository the diff paths are relative to) for the files in `mr`
 * (the output of `review.mjs parse`).
 */
export function projectContext(root, mr, { useGit = true } = {}) {
  const absRoot = path.resolve(root);
  const listing = listProjectFiles(absRoot, { useGit });
  const known = new Set(listing.paths);
  const testFiles = listing.paths.filter((p) => TEST_PATTERNS.some((re) => re.test(p)));

  const changed = mr.files.map((f) => {
    const checkout = checkoutState(absRoot, f);
    const lines = readLines(path.join(absRoot, f.path));
    return {
      path: f.path,
      ...(f.oldPath ? { oldPath: f.oldPath } : {}),
      changeType: f.changeType,
      reviewable: !f.skipped,
      checkout,
      exists: known.has(f.path) || lines !== null,
      ...(lines ? { lines: lines.length } : {}),
      tests: testsFor(f.path, testFiles),
    };
  });
  const reviewable = changed.filter((c) => c.reviewable);
  const states = reviewable.map((c) => c.checkout);
  // Wrong root: a changed (not added) file is missing and no changed file exists at all.
  const wrongRoot = states.includes('missing') && !reviewable.some((c) => c.exists);
  const state = wrongRoot ? 'missing' : overall(states);

  return {
    version: 1,
    root: absRoot,
    fileSource: listing.source,
    git: listing.source === 'git' ? gitInfo(absRoot) : null,
    totals: { files: listing.paths.length, testFiles: testFiles.length },
    checkout: state,
    hint: HINTS[state],
    structure: structure(listing.paths),
    context: contextFiles(listing.paths),
    changed,
  };
}
