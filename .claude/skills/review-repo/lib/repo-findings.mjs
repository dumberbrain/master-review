import fs from 'node:fs';
import path from 'node:path';
import { CliError, EXIT } from './errors.mjs';
import { SEVERITIES } from './rules.mjs';

export const REPO_RULE_FILE = 'repo.md';
const MAX_SNIPPET_LINES = 12;

function diskReader(root) {
  const cache = new Map();
  return (rel) => {
    if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n'));
    return cache.get(rel);
  };
}

function snippetOf(lines, startLine, line) {
  const end = Math.min(line, startLine + MAX_SNIPPET_LINES - 1);
  const out = lines.slice(startLine - 1, end);
  if (end < line) out.push('…');
  return out.join('\n');
}

// Rule prefixes allowed for a file: its language rule files, plus repository-level rules.
function allowedPrefixes(file, rules) {
  const own = file && !file.skipped ? file.ruleFiles.map((rf) => rules.prefixOfFile[rf]) : [rules.prefixOfFile[rules.cfg.general]];
  return [...own, rules.prefixOfFile[REPO_RULE_FILE]];
}

function checkLocation(loc, files, { requireLine }) {
  if (typeof loc.path !== 'string' || !loc.path) return 'missing path';
  const file = files.get(loc.path);
  if (!file) return `path ${loc.path} is not in the scan (paths are relative to the repo root)`;
  if (loc.line === undefined && !requireLine) return null;
  if (file.skipped) return `path ${loc.path} was skipped (${file.skipped.reason}); make it a general finding without a line`;
  if (!Number.isInteger(loc.line) || loc.line < 1) return 'line must be a positive integer';
  if (loc.line > file.lines) return `line ${loc.line} is past the end of ${loc.path} (${file.lines} lines)`;
  if (loc.startLine !== undefined && loc.startLine !== null) {
    if (!Number.isInteger(loc.startLine) || loc.startLine < 1) return 'startLine must be a positive integer';
    if (loc.startLine > loc.line) return 'startLine must be <= line';
  }
  return null;
}

function checkOne(raw, files, rules, read) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'finding must be an object' };
  const f = { ...raw, general: Boolean(raw.general) };
  for (const k of ['ruleId', 'title', 'body']) {
    if (typeof f[k] !== 'string' || !f[k].trim()) return { error: `missing ${k}` };
  }
  const rule = rules.byId.get(f.ruleId);
  if (!rule) return { error: `unknown ruleId ${f.ruleId}` };
  if (rule.status !== 'active') return { error: `rule ${f.ruleId} is retired` };
  f.severity = f.severity ?? rule.severity;
  if (!SEVERITIES.includes(f.severity)) return { error: `invalid severity ${f.severity}` };
  if (f.suggestion !== undefined && f.suggestion !== null && typeof f.suggestion !== 'string') {
    return { error: 'suggestion must be a string' };
  }

  if (f.general) {
    delete f.line;
    delete f.startLine;
    if (f.path !== undefined) {
      const err = checkLocation({ path: f.path }, files, { requireLine: false });
      if (err) return { error: err };
    }
  } else {
    const err = checkLocation(f, files, { requireLine: true });
    if (err) return { error: err };
    if (f.startLine === null || f.startLine === f.line) delete f.startLine;
    f.snippet = snippetOf(read(f.path), f.startLine ?? f.line, f.line);
  }

  const file = f.path ? files.get(f.path) : undefined;
  const allowed = allowedPrefixes(file, rules);
  if (!allowed.includes(rule.prefix)) {
    return { error: `rule ${f.ruleId} does not apply to ${f.path ?? 'a repository-wide finding'} (allowed: ${allowed.join(', ')})` };
  }

  if (f.related !== undefined) {
    if (!Array.isArray(f.related)) return { error: 'related must be an array of {path, line?}' };
    for (const loc of f.related) {
      const err = loc && typeof loc === 'object' ? checkLocation(loc, files, { requireLine: false }) : 'related entries must be objects';
      if (err) return { error: `related: ${err}` };
    }
  }
  return { finding: f };
}

const severityRank = (s) => SEVERITIES.indexOf(s);

export function sortRepoFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      (a.path ?? '').localeCompare(b.path ?? '') ||
      (a.startLine ?? a.line ?? 0) - (b.startLine ?? b.line ?? 0),
  );
}

/**
 * Validates the model's findings against the scan and the rule set.
 * `input` is `{ overview?, reviewed?, findings }` (a bare findings array is accepted too).
 */
export function validateRepoFindings(scan, input, rules, { now = new Date(), read = diskReader(scan.root) } = {}) {
  const doc = Array.isArray(input) ? { findings: input } : input;
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.findings)) {
    throw new CliError('findings file must be {"overview", "reviewed", "findings": [...]} or a JSON array', EXIT.INPUT);
  }
  const files = new Map(scan.files.map((f) => [f.path, f]));
  const invalid = [];
  const valid = [];
  const seen = new Map();

  doc.findings.forEach((raw, index) => {
    const r = checkOne(raw, files, rules, read);
    if (r.error) {
      invalid.push({ index, ruleId: raw?.ruleId, path: raw?.path, error: r.error });
      return;
    }
    const f = r.finding;
    const key = [f.ruleId, f.path ?? '', f.startLine ?? '', f.line ?? '', f.general ? f.title : ''].join('|');
    if (seen.has(key)) {
      invalid.push({ index, ruleId: f.ruleId, path: f.path, error: `duplicate of finding #${seen.get(key)}` });
      return;
    }
    seen.set(key, index);
    valid.push(f);
  });

  const reviewed = new Set();
  for (const p of doc.reviewed ?? []) {
    const file = files.get(p);
    if (!file || file.skipped) invalid.push({ reviewed: p, error: `reviewed path ${p} is not a reviewable file in the scan` });
    else reviewed.add(p);
  }
  for (const f of valid) if (f.path && !f.general) reviewed.add(f.path);

  const findings = sortRepoFindings(valid);
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) bySeverity[f.severity]++;
  const byRuleFile = {};
  for (const f of findings) {
    const file = rules.byId.get(f.ruleId).file;
    byRuleFile[file] = (byRuleFile[file] ?? 0) + 1;
  }

  return {
    invalid,
    report: {
      repo: { name: path.basename(scan.root), root: scan.root, scope: scan.scope, git: scan.git },
      reviewedAt: now.toISOString(),
      overview: typeof doc.overview === 'string' ? doc.overview.trim() : '',
      summary: {
        filesTotal: scan.totals.files,
        filesReviewable: scan.totals.reviewable,
        filesReviewed: reviewed.size,
        bySeverity,
        byRuleFile,
      },
      facts: {
        languages: scan.languages,
        skippedByReason: scan.skippedByReason,
        readme: scan.signals.readme,
        gitignore: scan.signals.gitignore,
        ci: scan.signals.ci,
        manifests: scan.signals.manifests,
        tests: scan.signals.tests,
      },
      reviewed: [...reviewed].sort(),
      notReviewed: scan.priority.filter((p) => !reviewed.has(p.path)).map((p) => p.path),
      findings,
    },
  };
}
