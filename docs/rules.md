# Rules

The rule files decide what the skills may report. A finding must cite exactly one active rule
that applies to the file. Otherwise the helper rejects it. Change the rule files to change
what your team's reviews flag.

- [Where rules live](#where-rules-live)
- [Rule file format](#rule-file-format)
- [Editing a rule](#editing-a-rule)
- [Adding a rule](#adding-a-rule)
- [Retiring a rule](#retiring-a-rule)
- [Adding a language](#adding-a-language)
- [Skipping files](#skipping-files)

## Where rules live

| File (edit here) | Prefix | Used by |
|-|-|-|
| `.claude/skills/review-diff/rules/general.md` | `GEN` | all skills, every file |
| `.claude/skills/review-diff/rules/<language>.md` | `CS`, `GO`, `JAVA`, `JS`, `TS`, `REACT` | all skills, by file extension |
| `.claude/skills/review-diff/rules/languages.json` | — | maps extensions to rule files; skip list |
| `.claude/skills/review-repo/rules/repo.md` | `REPO` | review-repo only |

`review-repo` and `review-change` get a copy of the `review-diff` rules through `npm run sync`.
Never edit the copies under `review-repo/rules/` (except `repo.md`), `review-change/rules/`,
`.agents/` or `.junie/`.

## Rule file format

~~~markdown
---
language: csharp
prefix: CS
version: 1.0.0
---

# C# Review Rules

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
| Front matter | `prefix` is required and must match `languages.json` |
| Heading | `### <PREFIX>-<NNN> — <Title>`: three digits, an em dash `—` with spaces around it. Headings inside code fences are ignored |
| `severity` | `blocker`, `major`, `minor` or `suggestion`; the default for findings |
| `status` | `active` or `retired`; only active rules can be cited |
| `look-for` | what the agent should look for, as concrete as possible. **Required** |
| `why` | the impact; reused in the comment. **Required** |
| `fix` | what to do instead. **Required** |
| `applies-to`, `sources` | optional context and links |
| Example | optional fenced code with `bad` / `good` |

`npm test` lints every rule file. It checks heading format, prefix, unique ids, severity,
status and the three required fields. It fails with the file and line of the problem.

## Editing a rule

- Make `look-for` concrete. The agent decides from this line, and vague wording produces
  vague findings.
- Changing `severity` changes the default for all future findings of that rule.
- Keep ids stable. Saved reports and team discussions refer to them.

After editing: `npm run sync` and `npm test`.

## Adding a rule

1. Append a new section to the right file, using the next free number (e.g. `TS-016`).
2. Fill in `severity`, `status: active`, `look-for`, `why`, `fix`, and ideally an example.
3. Use `GEN-*` only for problems that are truly language-independent.
4. Run `npm run sync` and `npm test`.

## Retiring a rule

Set `status: retired` instead of deleting the section. The id stays reserved, and findings
that cite it are rejected.

## Adding a language

Example: Python.

1. Create `.claude/skills/review-diff/rules/python.md` with front matter `prefix: PY` and rules
   `PY-001` and up.
2. Register it in `.claude/skills/review-diff/rules/languages.json`:

   ```json
   "python": { "file": "python.md", "prefix": "PY", "extensions": [".py"] }
   ```

   One extension may belong to several languages (`.tsx` → TypeScript and React). The file
   then gets the rules of all of them.
3. Optional: add the extension's code-fence language in `review-diff/lib/render.mjs`
   (`FENCE_LANG`), so suggestions get syntax highlighting.
4. Run `npm run sync` and `npm test`. The test checks that the file exists and that its prefix
   matches.

## Skipping files

`skip` in `languages.json` lists globs for files that are never reviewed: lock files, minified
and generated files, build output, vendored code. Patterns without `/` match the file name in
any folder (`*.min.js`). Patterns with `/` match from any folder level (`dist/**` also matches
`packages/web/dist/x.js`). Matching is case-insensitive.
