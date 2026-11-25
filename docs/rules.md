# Rules

The rule files decide what the skills may report. A finding must cite exactly one active rule
from a rule file that applies to the file. Otherwise the helper rejects it.

Rules are grouped into **packs**, one pack per resource the rules come from (Refactoring.Guru,
OWASP, patterns.dev, your team's own guidelines, …). A config decides which packs are on.

- [Packs](#packs)
- [The two configs](#the-two-configs)
- [Project config: `review.config.json`](#project-config-reviewconfigjson)
- [Adding your own pack](#adding-your-own-pack)
- [Rule file format](#rule-file-format)
- [Editing, adding and retiring a built-in rule](#editing-adding-and-retiring-a-built-in-rule)
- [Adding a built-in pack](#adding-a-built-in-pack)
- [Adding a language](#adding-a-language)
- [Skipping files](#skipping-files)
- [Checking a config: the `rules` command](#checking-a-config-the-rules-command)

## Packs

A pack is a folder of rule files, one file per language it covers (`general.md` applies to
every file). The built-in packs live in `.claude/skills/review-diff/rules/packs/`:

| Pack | Resource | Files | Rules |
|-|-|-|-|
| `refactoring-guru` | [Refactoring.Guru](https://refactoring.guru), [SourceMaking](https://sourcemaking.com): code smells, refactorings, design patterns, anti-patterns | general, csharp, go, java, javascript, typescript | 53 |
| `owasp` | [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org), CWE: security | general | 8 |
| `dotnet-practices` | MCP Market .NET C# expert skill, D. Gallivan's C# code smells | csharp | 15 |
| `go-review-comments` | [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments) | go | 11 |
| `patterns-dev` | [patterns.dev](https://www.patterns.dev) | javascript, typescript, react | 20 |
| `bulletproof-react` | [Bulletproof React](https://github.com/alan2207/bulletproof-react) | javascript, typescript, react | 11 |
| `react-docs` | [React docs: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | react | 4 |
| `repo` (review-repo only) | repository-level rules: secrets, tests, CI, dependencies, structure | general | 15 |

A rule belongs to the pack of the **first** source in its `sources` line. Rule ids did not
change when the packs were introduced, so `GEN-*` rules are spread over `refactoring-guru`
(GEN-001…012) and `owasp` (GEN-013…020). Some security rules (GEN-009, GEN-010, JS-007,
JS-009) cite SourceMaking first and so sit in `refactoring-guru`.

The files a reviewed file gets: every `general` file of every enabled pack, plus the files for
each language its extension maps to. A `.tsx` file gets `typescript` and `react` files. In the
helper output a rule file is named `<pack>/<file>`, e.g. `owasp/general.md`.

## The two configs

| Config | Where | Who edits it | What it does |
|-|-|-|-|
| Skill config | `.claude/skills/review-diff/rules/config.json` (copied to the other skills by `npm run sync`) | maintainers of this repository | languages and their extensions, built-in packs and whether they are on by default, skip globs |
| Project config | `review.config.json` in the directory the agent runs in, or any file passed with `--config` | each team, without touching the skill folders | turn packs on or off, add the team's own packs, change a rule's severity or retire it, add languages and skip globs |

The skill config:

```json
{
  "version": 2,
  "languages": {
    "typescript": { "extensions": [".ts", ".mts", ".cts", ".tsx"] },
    "react": { "extensions": [".jsx", ".tsx"] }
  },
  "packs": {
    "owasp": { "title": "OWASP Cheat Sheets and CWE: security", "url": "https://cheatsheetseries.owasp.org", "enabled": true }
  },
  "skip": ["package-lock.json", "dist/**"]
}
```

A built-in pack's folder is `rules/packs/<name>/`.

## Project config: `review.config.json`

Put it in the directory you run the agent in, usually the root of your repository. Every
helper command finds it there. Use `--config <file>` (or tell the agent "use rule config
`<file>`") for a file elsewhere. For `review-repo`, a config inside the **reviewed** repository
is not used, so a reviewed repository cannot switch its own review off.

All keys are optional:

```json
{
  "packs": {
    "patterns-dev": { "enabled": false },
    "acme": {
      "title": "ACME engineering guidelines",
      "url": "https://wiki.acme.example/engineering/code-review",
      "dir": "review-rules/acme"
    }
  },
  "rules": {
    "GEN-006": { "status": "retired" },
    "CS-004": { "severity": "blocker" }
  },
  "languages": {
    "python": { "extensions": [".py"] }
  },
  "skip": ["legacy/**", "*.snap"]
}
```

| Key | Effect |
|-|-|
| `packs.<built-in>.enabled` | `false` switches a built-in pack off, `true` switches it on. Nothing else may be set for a built-in pack |
| `packs.<new>` | adds a pack: `dir` (required, relative to the config file), `title`, `url`, `enabled` (default `true`) |
| `rules.<RULE-ID>` | `severity` (`blocker`, `major`, `minor`, `suggestion`) changes the default; `status: "retired"` stops the rule from being cited; `status: "active"` re-activates a retired rule. The id must exist in some pack, enabled or not |
| `languages.<name>.extensions` | adds a language, or replaces the extensions of an existing one |
| `skip` | extra globs, added to the built-in skip list |

Unknown keys, unknown rule ids, a missing pack folder or a rule id used twice stop the helper
with exit 1 and a message naming the config file. The review does not start until the config
is fixed.

`parse` (and `scan` for review-repo) records which config it used in `mr.json` / `scan.json`.
`validate` uses the same config, so changing the config between the two steps does not mix two
rule sets. Run the whole review again after you change the config.

## Adding your own pack

Example: your team's guidelines for TypeScript and Python.

1. Create a folder in your repository, e.g. `review-rules/acme/`, with one Markdown file per
   language. The file name is free, and the front matter decides the language:

   ```text
   review-rules/acme/
     general.md        language: general     prefix: ACME
     typescript.md     language: typescript  prefix: ACME-TS
     python.md         language: python      prefix: ACME-PY
   ```

2. Write the rules in the [rule file format](#rule-file-format). Ids must be unique across all
   packs, so choose a prefix of your own (`ACME-001`, `ACME-TS-001`, …). Do not reuse `GEN`,
   `TS`, etc.
3. Register the pack, and any new language, in `review.config.json`:

   ```json
   {
     "languages": { "python": { "extensions": [".py"] } },
     "packs": { "acme": { "title": "ACME engineering guidelines", "dir": "review-rules/acme" } }
   }
   ```

4. Check it: `node .claude/skills/review-diff/bin/review.mjs rules`. Exit 0 and
   `"problems": []` means the pack is valid. See [the `rules` command](#checking-a-config-the-rules-command).

To replace a built-in resource with your own version of it, disable the built-in pack and add
yours under a new name.

## Rule file format

~~~markdown
---
language: csharp
prefix: CS
version: 1.0.0
---

# .NET practices: C# rules

Intro text for the agent (optional).

### CS-001 — Async void method

- **severity**: major
- **status**: active
- **applies-to**: async methods, lambdas
- **look-for**: `async void` methods or lambdas that are not event handlers
- **why**: callers cannot await them, and an exception inside crashes the process
- **fix**: return `Task`; keep `async void` only for event handlers
- **sources**: https://…

```csharp
// bad
public async void SaveOrder(Order o) { … }
// good
public async Task SaveOrderAsync(Order o) { … }
```
~~~

| Part | Rules |
|-|-|
| Front matter | `language`: `general` or a language from the config. `prefix`: required. Several files may share a prefix (e.g. `GEN` in two packs) as long as ids stay unique |
| Heading | `### <PREFIX>-<NNN> — <Title>`: the file's prefix, three digits, an em dash `—` with spaces around it. Headings inside code fences are ignored |
| `severity` | `blocker`, `major`, `minor` or `suggestion`; the default for findings |
| `status` | `active` or `retired`; only active rules can be cited |
| `look-for` | what the agent should look for, as concrete as possible. **Required** |
| `why` | the impact; reused in the comment. **Required** |
| `fix` | what to do instead. **Required** |
| `applies-to`, `sources` | optional context and links |
| Example | optional fenced code with `bad` / `good` |

`npm test` lints the built-in packs. The `rules` command lints all packs, including yours. Both
check heading format, prefix, unique ids, severity, status and the three required fields, and
report the file and line of each problem.

## Editing, adding and retiring a built-in rule

Edit only under `.claude/skills/review-diff/rules/packs/` (or `review-repo/rules/packs/repo/`
for `REPO-*`). Run `npm run sync` and `npm test` afterwards.

- **Editing:** make `look-for` concrete. The agent decides from this line, and vague wording
  produces vague findings. Keep ids stable, because saved reports and team discussions refer
  to them.
- **Adding:** put the rule in the pack of the resource it comes from, in that pack's file for
  the language, using the next free number for the prefix (e.g. `TS-016`; the number is unique
  across all packs). Fill in `severity`, `status: active`, `look-for`, `why`, `fix`,
  `sources`, and ideally an example.
- **Retiring:** set `status: retired` instead of deleting the section. The id stays reserved,
  and findings that cite it are rejected. A team that disagrees with a single rule does not
  need this: it retires the rule in its own `review.config.json`.

## Adding a built-in pack

1. Create `.claude/skills/review-diff/rules/packs/<name>/` with one file per language
   (`general.md`, `typescript.md`, …). Use a new prefix per file (e.g. `SEC`, `SEC-JS`).
2. Register it in `.claude/skills/review-diff/rules/config.json` under `packs`, with `title`,
   `url` and `enabled`. A test fails if a folder under `packs/` is not registered.
3. Add a row to the [pack table](#packs).
4. Run `npm run sync` and `npm test`.

Use `"enabled": false` for a pack that teams should opt into.

## Adding a language

Example: Python, built in.

1. Register it in `.claude/skills/review-diff/rules/config.json`:

   ```json
   "python": { "extensions": [".py"] }
   ```

   One extension may belong to several languages (`.tsx` → TypeScript and React). The file
   then gets the rules of all of them.
2. Add `python.md` files (`language: python`) to the packs that have Python rules.
3. Optional: add the extension's code-fence language in `review-diff/lib/render.mjs`
   (`FENCE_LANG`), so suggestions get syntax highlighting.
4. Run `npm run sync` and `npm test`.

A team can do the same without changing the skills by using `languages` in
`review.config.json` and its own pack.

## Skipping files

`skip` lists globs for files that are never reviewed: lock files, minified and generated files,
build output, vendored code. Patterns without `/` match the file name in any folder
(`*.min.js`). Patterns with `/` match from any folder level (`dist/**` also matches
`packages/web/dist/x.js`). Matching is case-insensitive. A project config's `skip` is added to
the built-in list.

## Checking a config: the `rules` command

```sh
node .claude/skills/review-diff/bin/review.mjs rules [--config <file>]
node .claude/skills/review-repo/bin/review-repo.mjs rules [--config <file>]   # includes the repo pack
```

It prints the effective configuration as JSON: every pack with `enabled`, `origin`
(`built-in` or `project`), folder, files, and active/retired rule counts; the languages; the
skip list; the rule overrides; and `problems`, the lint results. It exits 1 when there are
problems, or when the config itself is invalid (the message is on stderr).
