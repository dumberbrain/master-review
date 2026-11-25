const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

// Parses unified-diff hunks. New-side lines that are added or context are commentable.
export function parsePatch(patch) {
  const validLines = [];
  const hunks = [];
  const text = {};
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;

  for (const raw of String(patch ?? '').split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const h = HUNK.exec(line);
    if (h) {
      oldLeft = h[2] === undefined ? 1 : Number(h[2]);
      newLine = Number(h[3]);
      newLeft = h[4] === undefined ? 1 : Number(h[4]);
      if (newLeft > 0) hunks.push({ newStart: newLine, newEnd: newLine + newLeft - 1 });
      continue;
    }
    if (oldLeft <= 0 && newLeft <= 0) continue;
    if (line.startsWith('\\')) continue;

    const sign = line[0];
    if (sign === '+') {
      validLines.push(newLine);
      text[newLine] = line.slice(1);
      newLine++;
      newLeft--;
    } else if (sign === '-') {
      oldLeft--;
    } else if (sign === ' ' || line === '') {
      validLines.push(newLine);
      text[newLine] = line.slice(1);
      newLine++;
      newLeft--;
      oldLeft--;
    }
  }
  return { validLines, hunks, text };
}

export function hunkOf(hunks, line) {
  return hunks.find((h) => line >= h.newStart && line <= h.newEnd) ?? null;
}

export function codeAt(patch, startLine, line) {
  const { text } = parsePatch(patch);
  const out = [];
  for (let n = startLine; n <= line; n++) {
    if (!(n in text)) return null;
    out.push(text[n]);
  }
  return out.join('\n');
}

export function normalizeCode(code) {
  return String(code ?? '').replace(/\s+/g, ' ').trim();
}
