import path from 'node:path';

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`, 'i');
}

export function matchGlob(glob, filePath) {
  const p = filePath.replace(/\\/g, '/');
  const re = globToRegExp(glob);
  if (!glob.includes('/')) return re.test(p.split('/').pop());
  if (re.test(p)) return true;
  for (let i = p.indexOf('/'); i !== -1; i = p.indexOf('/', i + 1)) {
    if (re.test(p.slice(i + 1))) return true;
  }
  return false;
}

// Returns the rule files for a path, from the rule set's enabled packs: every "general" file
// plus the files of every language whose extensions match (`.tsx` → typescript and react).
// Ids are "<pack>/<file>.md"; general files come first, then languages in config order.
export function rulesFor(filePath, ruleSet) {
  for (const glob of ruleSet.skip ?? []) {
    if (matchGlob(glob, filePath)) {
      return { language: null, ruleFiles: [], skipped: { reason: 'generated-or-lockfile' } };
    }
  }
  const ext = path.posix.extname(filePath.replace(/\\/g, '/')).toLowerCase();
  const matched = Object.entries(ruleSet.languages)
    .filter(([, l]) => l.extensions.includes(ext))
    .map(([name]) => name);
  const order = ['general', ...matched];
  const ruleFiles = ruleSet.files
    .filter((f) => f.enabled && order.includes(f.language))
    .sort((a, b) => order.indexOf(a.language) - order.indexOf(b.language))
    .map((f) => f.id);
  return { language: matched[0] ?? null, ruleFiles };
}
