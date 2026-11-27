import crypto from 'node:crypto';
import { codeAt, hunkOf, normalizeCode } from './diff.mjs';
import { CliError, EXIT } from './errors.mjs';
import { SEVERITIES } from './rules.mjs';

export const CONFIDENCES = ['high', 'medium', 'low'];
// Precision first: at most this many `suggestion`-severity findings reach the report.
export const MAX_SUGGESTIONS = 3;

// Drops what would be noise for the author: low-confidence findings, and nits beyond the cap
// (the most confident ones, in report order, are kept). Returns { kept, dropped }.
export function precisionFilter(findings, { maxSuggestions = MAX_SUGGESTIONS } = {}) {
  const dropped = [];
  const rank = (f) => CONFIDENCES.indexOf(f.confidence);
  const confident = [];
  for (const f of findings) {
    if (f.confidence === 'low') dropped.push({ ...f, dropReason: 'low confidence' });
    else confident.push(f);
  }
  const nits = confident.filter((f) => f.severity === 'suggestion');
  const keepNits = new Set(
    nits
      .map((f, i) => ({ f, i }))
      .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
      .slice(0, Math.max(0, maxSuggestions))
      .map(({ f }) => f),
  );
  const kept = [];
  for (const f of confident) {
    if (f.severity === 'suggestion' && !keepNits.has(f)) dropped.push({ ...f, dropReason: `over the limit of ${maxSuggestions} suggestions` });
    else kept.push(f);
  }
  return { kept, dropped };
}

export function findingKey(ruleId, path, code) {
  return crypto
    .createHash('sha1')
    .update(`${ruleId}\n${path}\n${normalizeCode(code)}`)
    .digest('hex')
    .slice(0, 12);
}

export function checkAnchor(file, startLine, line) {
  if (startLine === line && !(file.validLines ?? []).includes(line)) {
    return { ok: false, error: `line ${line} is not part of the diff` };
  }
  const h = hunkOf(file.hunks ?? [], startLine);
  if (!h || line > h.newEnd) {
    return { ok: false, error: `lines ${startLine}-${line} are not inside one diff hunk` };
  }
  const valid = new Set(file.validLines);
  for (let n = startLine; n <= line; n++) {
    if (!valid.has(n)) return { ok: false, error: `line ${n} is not part of the diff` };
  }
  return { ok: true, code: codeAt(file.patch, startLine, line) };
}

function checkOne(raw, files, rules) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'finding must be an object' };
  const f = { ...raw, general: Boolean(raw.general) };
  for (const k of ['ruleId', 'title', 'body']) {
    if (typeof f[k] !== 'string' || !f[k].trim()) return { error: `missing ${k}` };
  }
  const rule = rules.byId.get(f.ruleId);
  if (!rule) return { error: `unknown ruleId ${f.ruleId}` };
  if (!rule.packEnabled) return { error: `rule ${f.ruleId} belongs to the disabled pack "${rule.pack}"` };
  if (rule.status !== 'active') return { error: `rule ${f.ruleId} is retired` };
  f.severity = f.severity ?? rule.severity;
  if (!SEVERITIES.includes(f.severity)) return { error: `invalid severity ${f.severity}` };
  f.confidence = f.confidence ?? 'medium';
  if (!CONFIDENCES.includes(f.confidence)) return { error: `invalid confidence ${f.confidence} (use ${CONFIDENCES.join(', ')})` };
  if (f.suggestion !== undefined && f.suggestion !== null && typeof f.suggestion !== 'string') {
    return { error: 'suggestion must be a string' };
  }

  const file = typeof f.path === 'string' ? files.get(f.path) : undefined;
  if (!f.general) {
    if (typeof f.path !== 'string') return { error: 'missing path' };
    if (!file) return { error: `path ${f.path} is not in the merge request` };
  }
  if (file) {
    if (file.skipped) return { error: `path ${f.path} was skipped (${file.skipped.reason})` };
    if (!file.ruleFiles.includes(rule.file)) {
      return { error: `rule ${f.ruleId} (${rule.file}) does not apply to ${f.path} (its rule files: ${file.ruleFiles.join(', ')})` };
    }
  }

  if (f.general) {
    f.status = 'pending';
    f.key = findingKey(f.ruleId, f.path ?? '', f.title);
    return { finding: f };
  }

  if (!Number.isInteger(f.line) || f.line < 1) return { error: 'line must be a positive integer' };
  if (f.startLine === undefined || f.startLine === null || f.startLine === f.line) {
    delete f.startLine;
  } else {
    if (!Number.isInteger(f.startLine) || f.startLine < 1) return { error: 'startLine must be a positive integer' };
    if (f.startLine > f.line) return { error: 'startLine must be <= line' };
  }

  const a = checkAnchor(file, f.startLine ?? f.line, f.line);
  if (a.ok) {
    f.status = 'pending';
    f.anchorCode = a.code;
    f.key = findingKey(f.ruleId, f.path, a.code);
    delete f.error;
  } else {
    f.status = 'unmapped';
    f.error = a.error;
    f.key = findingKey(f.ruleId, f.path, f.title);
  }
  return { finding: f };
}

export function sortFindings(mr, findings) {
  const order = new Map(mr.files.map((f, i) => [f.path, i]));
  return [...findings].sort(
    (a, b) =>
      (order.get(a.path) ?? 1e9) - (order.get(b.path) ?? 1e9) ||
      (a.startLine ?? a.line ?? 0) - (b.startLine ?? b.line ?? 0),
  );
}

export function summarize(mr, findings) {
  const filesSkipped = mr.files.filter((f) => f.skipped).map((f) => ({ path: f.path, reason: f.skipped.reason }));
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  const byStatus = {};
  for (const f of findings) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  return {
    filesReviewed: mr.files.length - filesSkipped.length,
    reviewedFiles: mr.files.filter((f) => !f.skipped).map((f) => f.path),
    filesSkipped,
    bySeverity,
    byStatus,
  };
}

export function publicMr(mr) {
  const { files, ...rest } = mr;
  return {
    ...rest,
    files: files.map(({ path, oldPath, changeType, language, skipped }) => ({
      path,
      oldPath,
      changeType,
      language,
      skipped,
    })),
  };
}

export function validateFindings(mr, findings, rules, { mode = 'file', now = new Date(), maxSuggestions = MAX_SUGGESTIONS } = {}) {
  if (!Array.isArray(findings)) throw new CliError('findings must be a JSON array', EXIT.INPUT);
  const files = new Map(mr.files.map((f) => [f.path, f]));
  const invalid = [];
  const valid = [];
  findings.forEach((raw, index) => {
    const r = checkOne(raw, files, rules);
    if (r.error) invalid.push({ index, error: r.error });
    else valid.push(r.finding);
  });
  const { kept, dropped } = precisionFilter(sortFindings(mr, valid), { maxSuggestions });
  return {
    invalid,
    report: {
      mergeRequest: publicMr(mr),
      reviewedAt: now.toISOString(),
      mode,
      summary: summarize(mr, kept),
      findings: kept,
      dropped,
    },
  };
}
