import path from 'node:path';
import { SEVERITIES } from './rules.mjs';

const FENCE_LANG = {
  '.cs': 'csharp', '.go': 'go', '.java': 'java', '.kt': 'kotlin', '.ts': 'typescript', '.mts': 'typescript',
  '.cts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.jsx': 'jsx', '.py': 'python', '.rb': 'ruby', '.php': 'php', '.rs': 'rust', '.sql': 'sql', '.sh': 'bash',
  '.ps1': 'powershell', '.yml': 'yaml', '.yaml': 'yaml', '.json': 'json', '.xml': 'xml', '.html': 'html',
  '.css': 'css', '.scss': 'scss', '.md': 'markdown', '.toml': 'toml', '.tf': 'hcl',
};

export function langOf(filePath) {
  return FENCE_LANG[path.posix.extname(String(filePath ?? '')).toLowerCase()] ?? '';
}

// A fence one backtick longer than any backtick run inside the content.
export function fenceFor(content, min = 3) {
  const runs = String(content).match(/`+/g) ?? [];
  return '`'.repeat(Math.max(min, runs.reduce((n, r) => Math.max(n, r.length), 0) + 1));
}

function codeBlock(content, filePath) {
  const text = String(content).replace(/\r?\n$/, '');
  const fence = fenceFor(text);
  return [`${fence}${langOf(filePath)}`, text, fence];
}

// Markdown link from the report file to `repoPath` (optionally a line), so it opens in the IDE.
export function linkTo(report, outDir, repoPath, line) {
  const rel = path.relative(outDir, path.join(report.repo.root, repoPath)).split(path.sep).join('/');
  const label = line ? `${repoPath}:${line}` : repoPath;
  return `[${label}](${encodeURI(rel)}${line ? `#L${line}` : ''})`;
}

function lineLabel(f) {
  return f.startLine ? `lines ${f.startLine}–${f.line}` : `line ${f.line}`;
}

function heading(f, n) {
  return `#### ${n}. [${f.severity}] ${f.ruleId} — ${f.title}`;
}

function renderFinding(f, n, ctx) {
  const out = [heading(f, n), ''];
  if (!f.general) out.push(`${linkTo(ctx.report, ctx.outDir, f.path, f.startLine ?? f.line)} · ${lineLabel(f)}`, '');
  else if (f.path) out.push(`Where: ${linkTo(ctx.report, ctx.outDir, f.path)}`, '');
  out.push(f.body.trim(), '');
  if (f.snippet) out.push(...codeBlock(f.snippet, f.path), '');
  if (f.related?.length) {
    out.push('Also here:', '', ...f.related.map((r) => `- ${linkTo(ctx.report, ctx.outDir, r.path, r.line)}`), '');
  }
  if (f.suggestion) out.push('**Suggested fix**', '', ...codeBlock(f.suggestion, f.path), '');
  out.push('---', '');
  return out;
}

const rank = (s) => SEVERITIES.indexOf(s);

function groupByFile(findings) {
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.path)) groups.set(f.path, []);
    groups.get(f.path).push(f);
  }
  const worst = (list) => Math.min(...list.map((f) => rank(f.severity)));
  return [...groups.entries()]
    .map(([p, list]) => [p, [...list].sort((a, b) => (a.startLine ?? a.line) - (b.startLine ?? b.line))])
    .sort((a, b) => worst(a[1]) - worst(b[1]) || a[0].localeCompare(b[0]));
}

function details(summary, items) {
  if (!items.length) return [];
  return [`<details><summary>${summary}</summary>`, '', ...items, '', '</details>', ''];
}

function factsSection(report) {
  const f = report.facts;
  const langs = Object.entries(f.languages)
    .sort((a, b) => b[1].lines - a[1].lines)
    .slice(0, 8)
    .map(([k, v]) => `${k} ${v.files} files / ${v.lines.toLocaleString('en-US')} lines`);
  const manifests = f.manifests.map((m) => {
    let lock = '';
    if (m.lockfile) lock = `, lockfile \`${m.lockfile}\``;
    else if (m.lockfile === null) lock = ', **no lockfile**';
    return `\`${m.path}\` (${m.ecosystem}${lock})`;
  });
  const skipped = Object.entries(f.skippedByReason).map(([k, v]) => `${k} ${v}`);
  return [
    '## Scan facts',
    '',
    `- Languages: ${langs.join(' · ') || 'none detected'}`,
    `- Tests: ${f.tests.testFiles} test files for ${f.tests.codeFiles} code files`,
    `- CI: ${f.ci.length ? f.ci.map((p) => `\`${p}\``).join(', ') : 'none found'}`,
    `- README: ${f.readme ? `\`${f.readme}\`` : 'none'} · .gitignore: ${f.gitignore ? 'yes' : 'no'}`,
    `- Manifests: ${manifests.join(', ') || 'none'}`,
    `- Skipped files: ${skipped.join(' · ') || 'none'}`,
    '',
  ];
}

export function renderRepoReview(report, { outDir = report.repo.root } = {}) {
  const s = report.summary;
  const r = report.repo;
  const ctx = { report, outDir };
  const general = report.findings.filter((f) => f.general);
  const byFile = report.findings.filter((f) => !f.general);

  const out = [`# Repository review — ${r.name}${r.scope ? ` / ${r.scope}` : ''}`, '', '| | |', '|-|-|'];
  out.push(`| Path | \`${r.root}\`${r.scope ? ` (scope \`${r.scope}\`)` : ''} |`);
  if (r.git) out.push(`| Commit | \`${r.git.head}\` on \`${r.git.branch}\` (${r.git.lastCommit}) |`);
  out.push(
    `| Reviewed at | ${report.reviewedAt} |`,
    `| Coverage | ${s.filesReviewed} of ${s.filesReviewable} reviewable files read (${s.filesTotal} files in total) |`,
    '',
  );
  if (report.overview) out.push('## Overview', '', report.overview, '');

  out.push('## Summary', '', `- Findings: ${SEVERITIES.map((k) => `${k} ${s.bySeverity[k] ?? 0}`).join(' · ')}`);
  const serious = report.findings.filter((f) => rank(f.severity) <= rank('major'));
  const top = (serious.length ? serious : report.findings).slice(0, 5);
  if (top.length) {
    out.push('- Top issues:');
    top.forEach((f, i) => {
      const where = f.path ? ` — ${linkTo(report, outDir, f.path, f.general ? undefined : f.startLine ?? f.line)}` : '';
      out.push(`  ${i + 1}. [${f.severity}] ${f.ruleId} — ${f.title}${where}`);
    });
  }
  out.push('');

  let n = 0;
  if (report.findings.length === 0) out.push('## Findings', '', 'No findings.', '');
  if (general.length) {
    out.push('## Repository-level findings', '');
    for (const f of general) out.push(...renderFinding(f, ++n, ctx));
  }
  if (byFile.length) {
    out.push('## Findings by file', '');
    for (const [p, list] of groupByFile(byFile)) {
      out.push(`### ${linkTo(report, outDir, p)}`, '');
      for (const f of list) out.push(...renderFinding(f, ++n, ctx));
    }
  }

  out.push(
    '## Coverage',
    '',
    'Only the files below were read in full; the rest of the repository was covered by the scan signals only.',
    '',
    ...details(`Files reviewed (${report.reviewed.length})`, report.reviewed.map((p) => `- ${linkTo(report, outDir, p)}`)),
    ...details(
      `High-priority files not reviewed (${report.notReviewed.length})`,
      report.notReviewed.map((p) => `- ${linkTo(report, outDir, p)}`),
    ),
    ...factsSection(report),
  );
  return `${out.join('\n').trimEnd()}\n`;
}
