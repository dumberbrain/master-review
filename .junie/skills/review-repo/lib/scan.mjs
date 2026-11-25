import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { matchGlob, rulesFor } from './languages.mjs';

// Deterministic facts about a repository. The model verifies every signal before it
// becomes a finding; nothing here is a finding on its own.

const MAX_TEXT_BYTES = 1_000_000;
const MAX_SCAN_LINE = 2000; // longer lines are minified/generated: no TODO/secret scan
const LARGE_FILE_LINES = 400;
const LARGE_BINARY_BYTES = 1_000_000;
const TOP = 15;

// Used only when the folder is not a git work tree (git ls-files already honours .gitignore).
const WALK_IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'target', 'obj', 'coverage', 'vendor', '.next', '.nuxt',
  '.venv', 'venv', '__pycache__', '.idea', '.vs', '.gradle', '.review-repo', '.review-comment', '.review-change',
]);
const OWN_OUTPUT = ['.review-repo/**', '.review-comment/**', '.review-change/**', 'repo-review.md', 'repo-review-*.md'];
// The review skills themselves, when they are installed into the repo being reviewed.
const TOOLING = ['**/skills/review-repo/**', '**/skills/review-diff/**', '**/skills/review-change/**'];
const MIN_HOTSPOT_CHANGES = 2;

const EXT_LANG = {
  '.py': 'python', '.rb': 'ruby', '.php': 'php', '.kt': 'kotlin', '.kts': 'kotlin', '.rs': 'rust',
  '.swift': 'swift', '.scala': 'scala', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp',
  '.vue': 'vue', '.svelte': 'svelte', '.dart': 'dart', '.sh': 'shell', '.ps1': 'powershell',
  '.sql': 'sql', '.css': 'css', '.scss': 'scss', '.html': 'html', '.tf': 'terraform',
  '.yml': 'yaml', '.yaml': 'yaml', '.json': 'json', '.md': 'markdown', '.xml': 'xml', '.toml': 'toml',
};
const NON_CODE = new Set(['yaml', 'json', 'markdown', 'xml', 'toml']);

const TEST_PATTERNS = [
  /(^|\/)(test|tests|__tests__|spec|specs|e2e)\//i,
  /\.(test|spec)\.[^/]+$/i,
  /_test\.(go|py)$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /(Tests?|IT)\.(java|kt|cs)$/,
];
const ENTRYPOINTS = [
  /(^|\/)(main|index|app|server)\.[cm]?[jt]sx?$/i,
  /(^|\/)(Program|Startup)\.cs$/,
  /Application\.(java|kt)$/,
  /(^|\/)main\.go$/,
  /(^|\/)(main|app|manage|wsgi|asgi)\.py$/,
];
const MANIFESTS = [
  { glob: 'package.json', ecosystem: 'node', locks: ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb'] },
  { glob: 'go.mod', ecosystem: 'go', locks: ['go.sum'] },
  { glob: 'Cargo.toml', ecosystem: 'rust', locks: ['Cargo.lock'] },
  { glob: 'composer.json', ecosystem: 'php', locks: ['composer.lock'] },
  { glob: 'Gemfile', ecosystem: 'ruby', locks: ['Gemfile.lock'] },
  { glob: 'pyproject.toml', ecosystem: 'python', locks: ['poetry.lock', 'uv.lock', 'pdm.lock', 'Pipfile.lock'] },
  { glob: 'Pipfile', ecosystem: 'python', locks: ['Pipfile.lock'] },
  { glob: 'requirements*.txt', ecosystem: 'python', locks: null },
  { glob: 'pom.xml', ecosystem: 'maven', locks: null },
  { glob: 'build.gradle', ecosystem: 'gradle', locks: null },
  { glob: 'build.gradle.kts', ecosystem: 'gradle', locks: null },
  { glob: '*.csproj', ecosystem: 'dotnet', locks: null },
  { glob: '*.sln', ecosystem: 'dotnet', locks: null },
];
const CI_GLOBS = [
  '.github/workflows/*', '.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile', '.circleci/**',
  'bitbucket-pipelines.yml', '.travis.yml', '.drone.yml', '.ci-cd/**',
];
const CONTEXT_GLOBS = [
  'Dockerfile*', 'docker-compose*.yml', 'docker-compose*.yaml', 'compose.yml', 'compose.yaml',
  'tsconfig*.json', 'appsettings*.json', 'application*.yml', 'application*.properties', '.env.example',
];
const ARTIFACT_GLOBS = ['dist/**', 'build/**', 'obj/**', 'bin/Debug/**', 'bin/Release/**', 'node_modules/**', '*.map'];

const SENSITIVE_FILE = [
  /^\.env(\.[\w-]+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/,
  /^credentials(\.json)?$/i,
  /^\.(npmrc|pypirc|netrc)$/i,
];
const NOT_SENSITIVE = /\.(example|sample|template|dist|defaults)$/i;

// group 1, when present, is the secret value; otherwise the whole match is.
const SECRET_PATTERNS = [
  { kind: 'private-key', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  { kind: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { kind: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { kind: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { kind: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { kind: 'connection-string-password', re: /\b(?:Password|Pwd)\s*=\s*([^;"'\s]{4,})/i },
  {
    kind: 'assignment',
    re: /\b[\w.-]*(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{6,})["']/i,
  },
];
const PLACEHOLDER = /^[$<{%*]|\$\{|^(x+|changeme|change-me|password|secret|example|placeholder|your[\w-]*|todo|redacted|dummy|test|null|none|undefined)$/i;
const TODO = /\b(TODO|FIXME|HACK)\b/;

function posix(p) {
  return p.replace(/\\/g, '/');
}

function anyGlob(globs, p) {
  return globs.some((g) => matchGlob(g, p));
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function listFiles(root, { useGit = true } = {}) {
  if (useGit) {
    try {
      // -z: paths are NUL-separated and never quoted, so non-ASCII names survive.
      const out = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
      const paths = out.split('\0').filter((p) => p && fs.existsSync(path.join(root, p)));
      return { source: 'git', paths };
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
  return { source: 'walk', paths: paths.sort() };
}

function gitInfo(root) {
  try {
    const head = git(root, ['rev-parse', '--short', 'HEAD']).trim();
    const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const lastCommit = git(root, ['log', '-1', '--format=%cI']).trim();
    return { head, branch, lastCommit };
  } catch {
    return null;
  }
}

// Change counts per path over the last year; paths are relative to `root` (--relative).
function churn(root) {
  const counts = new Map();
  try {
    const out = git(root, ['log', '--since=12.months', '--no-merges', '--relative', '--name-only', '--format=']);
    for (const line of out.split('\n')) {
      const p = line.trim();
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  } catch {
    // no history
  }
  return counts;
}

export function redact(value) {
  return `${value.slice(0, 4)}… (${value.length} chars)`;
}

export function findSecrets(line) {
  const hits = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    const m = re.exec(line);
    if (!m) continue;
    const value = m[1] ?? m[0];
    if (m[1] !== undefined && PLACEHOLDER.test(value)) continue;
    hits.push({ kind, preview: kind === 'private-key' ? 'PRIVATE KEY block' : redact(value) });
  }
  return hits;
}

function countLines(text) {
  if (text === '') return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

function describe(root, rel, cfg, { includeTooling }) {
  const abs = path.join(root, rel);
  const bytes = fs.statSync(abs).size;
  const isTest = TEST_PATTERNS.some((re) => re.test(rel));
  const r = rulesFor(rel, cfg);
  const ext = path.posix.extname(rel).toLowerCase();
  const language = r.language ?? EXT_LANG[ext] ?? null;
  const base = { path: rel, bytes, language, ruleFiles: r.ruleFiles, isTest, isCode: Boolean(language && !NON_CODE.has(language)) };
  if (anyGlob(OWN_OUTPUT, rel)) return { file: { ...base, ruleFiles: [], skipped: { reason: 'review output' } } };
  if (!includeTooling && anyGlob(TOOLING, rel)) return { file: { ...base, ruleFiles: [], skipped: { reason: 'review tooling' } } };
  if (r.skipped) return { file: { ...base, ruleFiles: [], skipped: r.skipped } };
  if (bytes > MAX_TEXT_BYTES) return { file: { ...base, ruleFiles: [], skipped: { reason: 'too large' } } };
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return { file: { ...base, ruleFiles: [], isCode: false, skipped: { reason: 'binary' } } };
  const text = buf.toString('utf8');
  return { file: { ...base, lines: countLines(text) }, text };
}

function nearestLock(paths, manifest, locks) {
  const set = new Set(paths);
  let dir = path.posix.dirname(manifest);
  for (;;) {
    for (const l of locks) {
      const candidate = dir === '.' ? l : `${dir}/${l}`;
      if (set.has(candidate)) return candidate;
    }
    if (dir === '.') return null;
    dir = path.posix.dirname(dir);
  }
}

function priorityOf(file, changes) {
  const reasons = [];
  let score = 0;
  if (ENTRYPOINTS.some((re) => re.test(file.path))) {
    score += 4;
    reasons.push('entrypoint');
  }
  if (changes >= MIN_HOTSPOT_CHANGES) {
    score += Math.min(changes, 20) * 0.5;
    reasons.push(`changed ${changes}x in 12 months`);
  }
  if (file.lines >= LARGE_FILE_LINES) reasons.push(`${file.lines} lines`);
  score += Math.min(file.lines / 100, 6);
  if (file.ruleFiles.length > 1) score += 2;
  if (file.isTest) score -= 3;
  return { score, reasons };
}

// Reads every text file once: line counts, TODO markers and secret candidates.
function scanContents(root, paths, cfg, opts) {
  const files = [];
  const todoFiles = [];
  const secretCandidates = [];
  for (const rel of paths) {
    const { file, text } = describe(root, rel, cfg, opts);
    files.push(file);
    if (text === undefined) continue;
    const todoLines = [];
    text.split('\n').forEach((line, i) => {
      if (line.length > MAX_SCAN_LINE) return;
      if (TODO.test(line)) todoLines.push(i + 1);
      for (const hit of findSecrets(line)) {
        if (secretCandidates.length < 100) secretCandidates.push({ path: rel, line: i + 1, ...hit });
      }
    });
    if (todoLines.length) todoFiles.push({ path: rel, count: todoLines.length, lines: todoLines.slice(0, 5) });
  }
  return { files, todoFiles, secretCandidates };
}

function tally(files) {
  const languages = {};
  const skippedByReason = {};
  for (const f of files) {
    if (f.skipped) {
      skippedByReason[f.skipped.reason] = (skippedByReason[f.skipped.reason] ?? 0) + 1;
      continue;
    }
    const k = f.language ?? (path.posix.extname(f.path) || 'other');
    languages[k] ??= { files: 0, lines: 0 };
    languages[k].files++;
    languages[k].lines += f.lines;
  }
  return { languages, skippedByReason };
}

function findManifests(paths) {
  const manifests = [];
  for (const p of paths) {
    const m = MANIFESTS.find((x) => matchGlob(x.glob, p.split('/').pop()));
    if (m) manifests.push({ path: p, ecosystem: m.ecosystem, lockfile: m.locks ? nearestLock(paths, p, m.locks) : undefined });
  }
  return manifests;
}

function buildSignals({ paths, files, todoFiles, secretCandidates, changes, prefix, isGit }) {
  const local = (p) => p.slice(prefix.length);
  const base = (p) => p.split('/').pop();
  const reviewable = new Map(files.filter((f) => !f.skipped).map((f) => [f.path, f]));
  const codeFiles = [...reviewable.values()].filter((f) => f.isCode);
  const manifests = findManifests(paths);
  const top = (list, by) => [...list].sort(by).slice(0, TOP);

  return {
    readme: paths.find((p) => /^readme(\.\w+)?$/i.test(local(p))) ?? null,
    gitignore: paths.includes(`${prefix}.gitignore`),
    ci: paths.filter((p) => anyGlob(CI_GLOBS, local(p))).slice(0, 20),
    manifests,
    missingLockfiles: manifests.filter((m) => m.lockfile === null).map((m) => m.path),
    tests: {
      testFiles: codeFiles.filter((f) => f.isTest).length,
      codeFiles: codeFiles.filter((f) => !f.isTest).length,
    },
    sensitiveFiles: paths.filter((p) => SENSITIVE_FILE.some((re) => re.test(base(p))) && !NOT_SENSITIVE.test(base(p))),
    secretCandidates,
    todos: {
      total: todoFiles.reduce((n, f) => n + f.count, 0),
      files: top(todoFiles, (a, b) => b.count - a.count),
    },
    largeFiles: top(codeFiles.filter((f) => f.lines >= LARGE_FILE_LINES), (a, b) => b.lines - a.lines).map((f) => ({
      path: f.path,
      lines: f.lines,
    })),
    hotspots: top(
      [...changes.entries()].filter(([p, n]) => n >= MIN_HOTSPOT_CHANGES && reviewable.has(p)),
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ).map(([p, n]) => ({ path: p, changes: n, lines: reviewable.get(p).lines })),
    buildArtifacts: isGit ? paths.filter((p) => anyGlob(ARTIFACT_GLOBS, local(p))).slice(0, 20) : [],
    largeBinaries: files
      .filter((f) => ['binary', 'too large'].includes(f.skipped?.reason) && f.bytes >= LARGE_BINARY_BYTES)
      .map((f) => ({ path: f.path, bytes: f.bytes })),
  };
}

// Docs, manifests, CI and config files the model should read first to understand the project.
function contextFiles(paths, signals, prefix) {
  const local = (p) => p.slice(prefix.length);
  const docs = paths.filter((p) => !local(p).includes('/') && /\.(md|txt|rst)$/i.test(p)).slice(0, 8);
  const config = paths.filter((p) => anyGlob(CONTEXT_GLOBS, local(p)));
  return [...new Set([...docs, ...signals.manifests.map((m) => m.path), ...signals.ci, ...config])].slice(0, 30);
}

function priorityFiles(files, changes, maxFiles) {
  return files
    .filter((f) => !f.skipped && f.isCode)
    .map((f) => ({ f, ...priorityOf(f, changes.get(f.path)) }))
    .sort((a, b) => b.score - a.score || a.f.path.localeCompare(b.f.path))
    .slice(0, maxFiles)
    .map(({ f, reasons }) => ({ path: f.path, lines: f.lines, ruleFiles: f.ruleFiles, reasons }));
}

function scopePrefix(scope) {
  const s = posix(scope ?? '')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
  return s ? `${s}/` : '';
}

/**
 * Scans `root` (optionally only `scope`, a sub-folder relative to root).
 * Returns inventory + signals; `files` holds every file, the rest is a summary.
 */
export function scanRepo(root, cfg, { scope = '', maxFiles = 40, useGit = true, includeTooling = false, now = new Date() } = {}) {
  const absRoot = path.resolve(root);
  const listing = listFiles(absRoot, { useGit });
  const prefix = scopePrefix(scope);
  const paths = listing.paths.map(posix).filter((p) => p.startsWith(prefix));
  const isGit = listing.source === 'git';
  const changes = isGit ? churn(absRoot) : new Map();

  const { files, todoFiles, secretCandidates } = scanContents(absRoot, paths, cfg, { includeTooling });
  const { languages, skippedByReason } = tally(files);
  const signals = buildSignals({ paths, files, todoFiles, secretCandidates, changes, prefix, isGit });
  const reviewable = files.filter((f) => !f.skipped);

  return {
    version: 1,
    root: absRoot,
    scope: prefix.replace(/\/$/, ''),
    scannedAt: now.toISOString(),
    fileSource: listing.source,
    git: isGit ? gitInfo(absRoot) : null,
    totals: {
      files: files.length,
      reviewable: reviewable.length,
      skipped: files.length - reviewable.length,
      lines: reviewable.reduce((n, f) => n + f.lines, 0),
    },
    languages,
    skippedByReason,
    signals,
    context: contextFiles(paths, signals, prefix),
    priority: priorityFiles(files, changes, maxFiles),
    files,
  };
}
