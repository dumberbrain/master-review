// Token-lean views of the merge request for the agent: a one-line-per-rule index instead of the
// full rule files, and plain-text patches with new-side line numbers instead of escaped JSON.

export const BATCH_CHARS = 24000;

function languagesOf(ruleSet, ruleFileIds) {
  const byId = new Map(ruleSet.files.map((f) => [f.id, f]));
  return [...new Set(ruleFileIds.map((id) => byId.get(id)?.language).filter(Boolean))];
}

/**
 * Markdown index of every active rule in the given rule files: id, effective severity, title
 * and `look-for` (what detection needs). `why` / `fix` / examples stay out; the agent fetches
 * them with the `rule` command only for rules it is about to cite.
 */
export const DIFF_INDEX_NOTE = 'Cite a rule only for a file whose `rules:` list (in the patch batch header) contains the section language.';

export function ruleIndex(ruleSet, ruleFileIds, { note = DIFF_INDEX_NOTE } = {}) {
  const wanted = new Set(ruleFileIds);
  const out = [
    '# Rule index',
    '',
    note,
    'Format: `ID severity · title — look-for`. Full why/fix/example: `HELPER rule <ID>`.',
  ];
  let count = 0;
  for (const f of ruleSet.files) {
    if (!wanted.has(f.id)) continue;
    const lines = [];
    for (const r of f.rules) {
      const eff = ruleSet.byId.get(r.id);
      if (!eff || eff.status !== 'active') continue;
      lines.push(`- ${r.id} ${eff.severity} · ${r.title} — ${r.fields['look-for'] ?? ''}`);
    }
    if (!lines.length) continue;
    count += lines.length;
    out.push('', `## ${f.id} (${f.language})`, ...lines);
  }
  return { text: `${out.join('\n')}\n`, rules: count };
}

// Full text of the named rules, for the `rule` command.
export function ruleDetails(ruleSet, ids) {
  const parsed = new Map();
  for (const f of ruleSet.files) for (const r of f.rules) parsed.set(r.id, r);
  const out = {};
  const unknown = [];
  for (const id of ids) {
    const r = parsed.get(id);
    const eff = ruleSet.byId.get(id);
    if (!r || !eff) {
      unknown.push(id);
      continue;
    }
    out[id] = {
      title: r.title,
      file: eff.file,
      severity: eff.severity,
      status: eff.status,
      appliesTo: r.fields['applies-to'],
      why: r.fields.why,
      fix: r.fields.fix,
      example: r.example,
    };
  }
  return { rules: out, unknown };
}

/**
 * One file's patch as numbered text. Every line with a number is commentable (added `+` or
 * context ` `); removed lines carry no number and cannot be commented.
 */
export function patchView(file, ruleSet) {
  const meta = [file.changeType, `rules: ${languagesOf(ruleSet, file.ruleFiles).join(', ')}`];
  if (file.risk?.length) meta.push(`risk: ${file.risk.join(', ')}`);
  const out = [`### ${file.path}${file.oldPath ? ` (from ${file.oldPath})` : ''}  [${meta.join(' · ')}]`];
  const width = String(Math.max(1, ...(file.validLines ?? [1]))).length;
  const blank = ' '.repeat(width);
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const raw of String(file.patch ?? '').split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const h = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (h) {
      oldLeft = h[1] === undefined ? 1 : Number(h[1]);
      newLine = Number(h[2]);
      newLeft = h[3] === undefined ? 1 : Number(h[3]);
      out.push(`@@ ${h[4].trim()}`.trimEnd());
      continue;
    }
    if (oldLeft <= 0 && newLeft <= 0) continue;
    if (line.startsWith('\\')) continue;
    if (line.startsWith('-')) {
      out.push(`${blank} -${line.slice(1)}`);
      oldLeft--;
    } else if (line.startsWith('+')) {
      out.push(`${String(newLine).padStart(width)} +${line.slice(1)}`);
      newLine++;
      newLeft--;
    } else {
      out.push(`${String(newLine).padStart(width)}  ${line.slice(1)}`);
      newLine++;
      newLeft--;
      oldLeft--;
    }
  }
  return out.join('\n');
}

// Reviewable files ordered by risk (highest first, diff order on ties), packed into batches of
// about `maxChars`; a file bigger than that gets a batch of its own.
export function patchBatches(files, ruleSet, maxChars = BATCH_CHARS) {
  const ordered = files
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !f.skipped)
    .sort((a, b) => (b.f.score ?? 0) - (a.f.score ?? 0) || a.i - b.i)
    .map(({ f }) => ({ path: f.path, text: patchView(f, ruleSet) }));
  const batches = [];
  let cur = null;
  for (const v of ordered) {
    if (!cur || (cur.chars + v.text.length > maxChars && cur.files.length)) {
      cur = { files: [], parts: [], chars: 0 };
      batches.push(cur);
    }
    cur.files.push(v.path);
    cur.parts.push(v.text);
    cur.chars += v.text.length;
  }
  return batches.map((b) => ({ files: b.files, text: `${b.parts.join('\n\n')}\n` }));
}
