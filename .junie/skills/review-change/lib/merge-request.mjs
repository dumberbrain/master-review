import fs from 'node:fs';
import { parsePatch } from './diff.mjs';
import { rulesFor } from './languages.mjs';

// Turns parsed diff files into reviewable files: language, rule files and commentable lines.
export function buildMr(raw, cfg) {
  const files = raw.files.map((f) => {
    const base = { path: f.path, oldPath: f.oldPath ?? undefined, changeType: f.changeType, patch: f.patch ?? null };
    if (f.changeType === 'deleted') return { ...base, language: null, ruleFiles: [], skipped: { reason: 'deleted' } };
    const r = rulesFor(f.path, cfg);
    if (r.skipped) return { ...base, language: null, ruleFiles: [], skipped: r.skipped };
    if (!f.patch) return { ...base, language: r.language, ruleFiles: r.ruleFiles, skipped: { reason: 'no-patch (binary or too large)' } };
    const { validLines, hunks } = parsePatch(f.patch);
    if (validLines.length === 0) {
      return { ...base, language: r.language, ruleFiles: r.ruleFiles, skipped: { reason: 'no added lines' } };
    }
    return { ...base, language: r.language, ruleFiles: r.ruleFiles, validLines, hunks };
  });
  return { ...raw, files };
}

const DIFF_GIT = 'diff --git ';
const UNQUOTED_PAIR = /^a\/(.+?) b\/(.+)$/;
const C_ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

// git C-quotes paths that contain special or non-ASCII characters (core.quotePath), e.g.
// "a/s\311\231b\311\231t.js": octal escapes are UTF-8 bytes. `s[start]` must be the opening
// quote; returns the decoded path and the index after the closing quote.
export function readQuoted(s, start = 0) {
  const bytes = [];
  let i = start + 1;
  while (i < s.length && s[i] !== '"') {
    if (s[i] === '\\' && /[0-7]{3}/.test(s.slice(i + 1, i + 4))) {
      bytes.push(Number.parseInt(s.slice(i + 1, i + 4), 8));
      i += 4;
    } else if (s[i] === '\\' && i + 1 < s.length) {
      const code = C_ESCAPES[s[i + 1]];
      bytes.push(...(code === undefined ? Buffer.from(s[i + 1]) : [code]));
      i += 2;
    } else {
      const ch = String.fromCodePoint(s.codePointAt(i));
      bytes.push(...Buffer.from(ch, 'utf8'));
      i += ch.length;
    }
  }
  return { value: Buffer.from(bytes).toString('utf8'), end: i + 1 };
}

// A path after `--- `, `+++ `, `rename from ` or `rename to `: quoted or plain (git adds a
// trailing tab to plain paths that contain spaces).
function pathToken(s) {
  return s.startsWith('"') ? readQuoted(s).value : s.replace(/\t$/, '');
}

function stripPrefix(p, prefix) {
  return p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

// `diff --git <a> <b>` where each side may be quoted. Returns [oldPath, newPath] or null
// when the header is ambiguous; the ---/+++ lines then supply the paths.
export function parseDiffGitHeader(rest) {
  let a;
  let b;
  if (rest.startsWith('"')) {
    const q = readQuoted(rest);
    a = q.value;
    const tail = rest.slice(q.end + 1);
    b = tail.startsWith('"') ? readQuoted(tail).value : tail;
  } else if (rest.endsWith('"') && rest.includes(' "b/')) {
    const at = rest.lastIndexOf(' "b/');
    a = rest.slice(0, at);
    b = readQuoted(rest, at + 1).value;
  } else {
    const m = UNQUOTED_PAIR.exec(rest);
    if (!m) return null;
    return [m[1], m[2]];
  }
  if (!a.startsWith('a/') || !b.startsWith('b/')) return null;
  return [a.slice(2), b.slice(2)];
}

function readHeaderLine(cur, raw) {
  if (raw.startsWith('new file mode')) cur.changeType = 'added';
  else if (raw.startsWith('deleted file mode')) cur.changeType = 'deleted';
  else if (raw.startsWith('rename from ')) {
    cur.oldPath = pathToken(raw.slice(12));
    cur.changeType = 'renamed';
  } else if (raw.startsWith('rename to ')) cur.path = pathToken(raw.slice(10));
  else if (raw.startsWith('--- ')) {
    const p = pathToken(raw.slice(4));
    if (p !== '/dev/null') cur.minusPath = stripPrefix(p, 'a/');
  } else if (raw.startsWith('+++ ')) {
    const p = pathToken(raw.slice(4));
    if (p !== '/dev/null') cur.path = stripPrefix(p, 'b/');
  }
}

// Splits a `git diff` / GitHub `.diff` / GitLab `.diff` text into per-file patches.
export function parseGitDiff(text) {
  const files = [];
  let cur = null;
  let inHunks = false;
  const all = text.replace(/\r\n/g, '\n').split('\n');
  if (all.at(-1) === '') all.pop(); // the newline that ends the last line
  for (const raw of all) {
    // Hunk lines start with ' ', '+', '-' or '\', so this always begins a new file.
    if (raw.startsWith(DIFF_GIT)) {
      const pair = parseDiffGitHeader(raw.slice(DIFF_GIT.length));
      cur = { path: pair?.[1] ?? null, oldPath: undefined, changeType: 'modified', patchLines: [] };
      if (pair && pair[0] !== pair[1]) {
        cur.oldPath = pair[0];
        cur.changeType = 'renamed';
      }
      files.push(cur);
      inHunks = false;
      continue;
    }
    if (!cur) continue;
    if (!inHunks) {
      if (raw.startsWith('@@')) inHunks = true;
      else readHeaderLine(cur, raw);
    }
    if (inHunks) cur.patchLines.push(raw);
  }
  return files
    .map(({ patchLines, minusPath, ...f }) => ({ ...f, path: f.path ?? minusPath ?? null, patch: patchLines.length ? patchLines.join('\n') : null }))
    .filter((f) => f.path);
}

export function loadLocalDiff(filePath, { platform = 'github', title } = {}) {
  const files = parseGitDiff(fs.readFileSync(filePath, 'utf8'));
  const host = platform === 'gitlab' ? 'gitlab.com' : 'github.com';
  return {
    platform,
    host,
    origin: `https://${host}`,
    project: 'local/diff',
    number: 0,
    url: `file:${filePath.replace(/\\/g, '/')}`,
    title: title || `Pasted diff ${filePath.replace(/\\/g, '/').split('/').pop()}`,
    files,
  };
}
