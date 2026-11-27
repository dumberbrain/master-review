import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, EXIT } from './errors.mjs';

export const RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rules');
export const CONFIG_FILE = 'config.json';
export const PROJECT_CONFIG_FILE = 'review.config.json';
export const GENERAL = 'general';
export const SEVERITIES = ['blocker', 'major', 'minor', 'suggestion'];
export const STATUSES = ['active', 'retired'];

const RULE_HEADING = /^###\s+(\S+)\s+—\s+(.+?)\s*$/;
const FIELD = /^- \*\*([\w-]+)\*\*:\s*(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const PACK_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXTENSION = /^\.[a-z0-9]+$/;
const REQUIRED_FIELDS = ['look-for', 'why', 'fix'];

const PROJECT_KEYS = ['$schema', 'packs', 'languages', 'skip', 'rules'];
const PACK_KEYS = ['title', 'url', 'enabled', 'dir'];
const RULE_OVERRIDE_KEYS = ['severity', 'status'];

export function parseRuleFile(content, file = '') {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const front = {};
  let i = 0;
  if (lines[0] === '---') {
    for (i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const m = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
      if (m) front[m[1]] = m[2].trim();
    }
    i++;
  }

  const rules = [];
  const badHeadings = [];
  let cur = null;
  let fence = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) {
        fence = f[1];
        if (cur && cur.example === undefined) cur.example = [];
        else if (cur) cur.exampleDone = true;
      } else if (line.trim().startsWith(fence) && /^(`+|~+)$/.test(line.trim())) {
        fence = null;
        if (cur) cur.exampleDone = true;
      }
      continue;
    }
    if (fence) {
      if (cur && !cur.exampleDone) cur.example.push(line);
      continue;
    }

    if (line.startsWith('### ')) {
      const m = RULE_HEADING.exec(line);
      if (m) {
        cur = { id: m[1], title: m[2], fields: {}, line: i + 1 };
        rules.push(cur);
      } else {
        badHeadings.push({ line: i + 1, text: line });
        cur = null;
      }
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      cur = null;
      continue;
    }
    const fm = cur && FIELD.exec(line);
    if (fm) cur.fields[fm[1]] = fm[2].trim();
  }
  for (const r of rules) {
    r.example = r.example ? r.example.join('\n') : undefined;
    delete r.exampleDone;
  }
  return { file, front, rules, badHeadings };
}

function fail(message) {
  throw new CliError(message, EXIT.INPUT);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function readJsonFile(p, what) {
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (e) {
    fail(`cannot read ${what} ${p}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(`${what} ${p} is not valid JSON: ${e.message}`);
  }
}

function checkKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) fail(`${where}: unknown key "${k}" (allowed: ${allowed.join(', ')})`);
  }
}

// The project's config: an explicit path (relative to cwd), else review.config.json in cwd.
export function findProjectConfig(explicit, cwd = process.cwd()) {
  if (explicit) {
    const p = path.resolve(cwd, explicit);
    if (!fs.existsSync(p)) fail(`config file not found: ${p}`);
    return p;
  }
  const p = path.join(cwd, PROJECT_CONFIG_FILE);
  return fs.existsSync(p) ? p : null;
}

// Built-in packs live in <rulesDir>/packs/<name>/ unless `dir` says otherwise. A pack that is
// already defined may only be switched on or off; a new pack from a project config needs `dir`.
function addPacks(packs, defs, { baseDir, where, origin }) {
  if (defs === undefined) return;
  if (!isObject(defs)) fail(`${where}: "packs" must be an object`);
  for (const [name, def] of Object.entries(defs)) {
    const at = `${where}: packs.${name}`;
    if (!PACK_NAME.test(name)) fail(`${at}: pack names use lowercase letters, digits and single hyphens`);
    if (!isObject(def)) fail(`${at} must be an object`);
    checkKeys(def, PACK_KEYS, at);
    if (def.enabled !== undefined && typeof def.enabled !== 'boolean') fail(`${at}.enabled must be true or false`);
    for (const k of ['title', 'url', 'dir']) {
      if (def[k] !== undefined && (typeof def[k] !== 'string' || !def[k].trim())) fail(`${at}.${k} must be a non-empty string`);
    }
    const existing = packs[name];
    if (existing) {
      const extra = Object.keys(def).filter((k) => k !== 'enabled');
      if (extra.length) fail(`${at}: pack "${name}" already exists (${existing.origin}); a config may only set "enabled" for it`);
      packs[name] = { ...existing, enabled: def.enabled ?? existing.enabled };
      continue;
    }
    if (origin === 'project' && !def.dir) fail(`${at}: a new pack needs "dir", the folder with its rule files (relative to the config file)`);
    packs[name] = {
      name,
      title: def.title ?? name,
      url: def.url ?? null,
      enabled: def.enabled ?? true,
      dir: path.resolve(baseDir, def.dir ?? path.join('packs', name)),
      origin,
    };
  }
}

function mergeLanguages(languages, defs, where) {
  if (defs === undefined) return;
  if (!isObject(defs)) fail(`${where}: "languages" must be an object`);
  for (const [name, def] of Object.entries(defs)) {
    const at = `${where}: languages.${name}`;
    if (name === GENERAL || !PACK_NAME.test(name)) fail(`${at}: invalid language name`);
    if (!isObject(def)) fail(`${at} must be an object`);
    checkKeys(def, ['extensions'], at);
    const ext = def.extensions;
    if (!Array.isArray(ext) || ext.length === 0 || !ext.every((e) => typeof e === 'string' && EXTENSION.test(e))) {
      fail(`${at}.extensions must be a non-empty list like [".py"] (lowercase, with the dot)`);
    }
    languages[name] = { extensions: [...ext] };
  }
}

function mergeSkip(skip, defs, where) {
  if (defs === undefined) return;
  if (!Array.isArray(defs) || !defs.every((g) => typeof g === 'string' && g.trim())) fail(`${where}: "skip" must be a list of globs`);
  skip.push(...defs);
}

function loadPackFiles(pack, languages) {
  if (!fs.existsSync(pack.dir) || !fs.statSync(pack.dir).isDirectory()) fail(`rule pack "${pack.name}": folder not found: ${pack.dir}`);
  const names = fs.readdirSync(pack.dir).filter((f) => f.endsWith('.md')).sort();
  if (names.length === 0) fail(`rule pack "${pack.name}": no .md rule files in ${pack.dir}`);
  return names.map((name) => {
    const id = `${pack.name}/${name}`;
    const abs = path.join(pack.dir, name);
    const parsed = parseRuleFile(fs.readFileSync(abs, 'utf8'), id);
    const { language, prefix } = parsed.front;
    if (!prefix) fail(`${id}: front matter needs "prefix"`);
    if (language !== GENERAL && !languages[language]) {
      fail(`${id}: front matter "language: ${language ?? ''}" must be "${GENERAL}" or a language from the config (${Object.keys(languages).join(', ')})`);
    }
    return { ...parsed, id, path: abs, pack: pack.name, enabled: pack.enabled, language, prefix };
  });
}

function applyOverrides(byId, overrides, where) {
  if (overrides === undefined) return {};
  if (!isObject(overrides)) fail(`${where}: "rules" must be an object of { "<RULE-ID>": { "severity"?, "status"? } }`);
  for (const [id, o] of Object.entries(overrides)) {
    const at = `${where}: rules.${id}`;
    const rule = byId.get(id);
    if (!rule) fail(`${at}: no such rule in any pack`);
    if (!isObject(o)) fail(`${at} must be an object`);
    checkKeys(o, RULE_OVERRIDE_KEYS, at);
    if (o.severity !== undefined && !SEVERITIES.includes(o.severity)) fail(`${at}.severity must be one of ${SEVERITIES.join(', ')}`);
    if (o.status !== undefined && !STATUSES.includes(o.status)) fail(`${at}.status must be one of ${STATUSES.join(', ')}`);
    Object.assign(rule, o);
  }
  return overrides;
}

/**
 * Loads the skill's rule config (`rules/config.json`), adds `extraPacks` (packs a single skill
 * ships, e.g. review-repo's "repo"), then applies the project config: packs switched on/off or
 * added, languages added, skip globs appended, and rule severity/status overrides.
 *
 * Every pack is parsed (disabled ones too) so rule ids stay unique and overrides can name any
 * rule; only enabled packs apply to files.
 */
export function loadRuleSet({ rulesDir = RULES_DIR, projectConfig = null, extraPacks = {} } = {}) {
  const configFile = path.join(rulesDir, CONFIG_FILE);
  const base = readJsonFile(configFile, 'rule config');
  const languages = {};
  const skip = [];
  const packs = {};
  mergeLanguages(languages, base.languages, configFile);
  mergeSkip(skip, base.skip, configFile);
  addPacks(packs, base.packs, { baseDir: rulesDir, where: configFile, origin: 'built-in' });
  addPacks(packs, extraPacks, { baseDir: rulesDir, where: 'skill packs', origin: 'built-in' });

  let project = {};
  if (projectConfig) {
    project = readJsonFile(projectConfig, 'project config');
    if (!isObject(project)) fail(`${projectConfig} must be a JSON object`);
    checkKeys(project, PROJECT_KEYS, projectConfig);
    mergeLanguages(languages, project.languages, projectConfig);
    mergeSkip(skip, project.skip, projectConfig);
    addPacks(packs, project.packs, { baseDir: path.dirname(projectConfig), where: projectConfig, origin: 'project' });
  }

  const files = Object.values(packs).flatMap((p) => loadPackFiles(p, languages));
  const byId = new Map();
  for (const f of files) {
    for (const r of f.rules) {
      if (byId.has(r.id)) fail(`duplicate rule id ${r.id} in ${byId.get(r.id).file} and ${f.id}`);
      byId.set(r.id, {
        id: r.id,
        title: r.title,
        file: f.id,
        pack: f.pack,
        packEnabled: f.enabled,
        language: f.language,
        prefix: f.prefix,
        severity: r.fields.severity,
        status: r.fields.status,
      });
    }
  }
  const overrides = applyOverrides(byId, project.rules, projectConfig);

  return { configFile, projectConfig, languages, skip, packs, files, byId, overrides };
}

// Problems an author must fix in the rule files (the CLI `rules` command and the tests use it).
export function lintRuleSet(ruleSet) {
  const problems = [];
  const add = (file, line, message) => problems.push({ file: file.id, path: file.path, line, message });
  for (const file of ruleSet.files) {
    for (const h of file.badHeadings) add(file, h.line, `heading must be "### ${file.prefix}-NNN — Title": ${h.text}`);
    if (file.rules.length === 0) add(file, 1, 'no rules');
    const idPattern = new RegExp(`^${file.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{3}$`);
    for (const r of file.rules) {
      if (!idPattern.test(r.id)) add(file, r.line, `${r.id}: id must be ${file.prefix}-NNN (the file's prefix and three digits)`);
      if (!SEVERITIES.includes(r.fields.severity)) add(file, r.line, `${r.id}: severity must be one of ${SEVERITIES.join(', ')}`);
      if (!STATUSES.includes(r.fields.status)) add(file, r.line, `${r.id}: status must be one of ${STATUSES.join(', ')}`);
      for (const field of REQUIRED_FIELDS) if (!r.fields[field]) add(file, r.line, `${r.id}: missing ${field}`);
    }
  }
  return problems;
}

// The rule files a set of files needs, as { "<pack>/<file>.md": "<absolute path>" }.
export function ruleFilePaths(ruleSet, ids) {
  const wanted = new Set(ids);
  return Object.fromEntries(ruleSet.files.filter((f) => wanted.has(f.id)).map((f) => [f.id, f.path]));
}

// What the agent needs to know about the rules besides the files themselves.
export function ruleSetSummary(ruleSet, usedFileIds) {
  const out = {
    config: ruleSet.projectConfig,
    packs: Object.values(ruleSet.packs).filter((p) => p.enabled).map((p) => p.name),
    disabledPacks: Object.values(ruleSet.packs).filter((p) => !p.enabled).map((p) => p.name),
    files: ruleFilePaths(ruleSet, usedFileIds),
  };
  if (Object.keys(ruleSet.overrides).length) out.overrides = ruleSet.overrides;
  return out;
}

// Full description for the `rules` command: every pack with its files and rule counts.
export function describeRuleSet(ruleSet) {
  return {
    config: ruleSet.configFile,
    projectConfig: ruleSet.projectConfig,
    packs: Object.values(ruleSet.packs).map((p) => {
      const files = ruleSet.files.filter((f) => f.pack === p.name);
      const rules = [...ruleSet.byId.values()].filter((r) => r.pack === p.name);
      return {
        name: p.name,
        enabled: p.enabled,
        origin: p.origin,
        title: p.title,
        url: p.url,
        dir: p.dir,
        files: files.map((f) => ({ file: f.id, language: f.language, prefix: f.prefix, rules: f.rules.length })),
        activeRules: rules.filter((r) => r.status === 'active').length,
        retiredRules: rules.filter((r) => r.status !== 'active').length,
      };
    }),
    languages: ruleSet.languages,
    skip: ruleSet.skip,
    overrides: ruleSet.overrides,
    problems: lintRuleSet(ruleSet),
  };
}
