---
name: review-repo
description: Review a whole repository (not a diff) — the current one or another repository given by path — against this skill's rule files and write repo-review.md with prioritized findings (file, line, severity, rule, suggested fix) and repository-level problems such as committed secrets, missing tests, CI or lockfiles, layering violations and hotspots. Read-only, never changes the reviewed code. Use when the user asks to analyze, audit or review a whole repo / codebase / project, or runs /review-repo.
argument-hint: [repo-path] [subfolder] [output.md]
allowed-tools: Read, Write, Glob, Grep, Bash(node:*)
---

# Review a whole repository into `repo-review.md`

You review a repository (`REPO`: the current working directory, or another folder the user
gives) against this skill's rule files and write a Markdown report. **You never edit, delete,
commit or push anything in `REPO`** — the only files you write are under `.review-repo/` and
the report itself, both in the current working directory.

## Setup

- `SKILL_ROOT` = this skill's base directory: the folder that holds this `SKILL.md` and
  `bin/`, `lib/`, `rules/` (e.g. `.claude/skills/review-repo`, `.agents/skills/review-repo`).
- `HELPER` = `node "<SKILL_ROOT>/bin/review-repo.mjs"` — always quote paths, they may contain spaces.
  The helper needs Node.js >= 18 and a shell; it has no dependencies.
- `WORK` = `.review-repo/` in the current working directory. Keep it after the run.
- Arguments (in Claude Code `$ARGUMENTS`; in other agents take them from the user's message):
  - An argument ending in `.md` is the output path.
  - A path to an existing directory outside the current working directory (absolute, or
    starting with `..`, or one the user calls "the repo / project to review") is `REPO`.
    Default: the current working directory.
  - A remaining path is a sub-folder of `REPO` to limit the review to (monorepos, big repos),
    relative to `REPO`.
  - Default output: `./repo-review.md` when `REPO` is the current working directory,
    otherwise `./repo-review-<name>.md`, where `<name>` is the last folder name of `REPO`.
- All paths in `scan.json` and in findings are relative to `REPO`. To read or Grep a file, use
  `<REPO>/<path>`; never read the same relative path from the current working directory.

## Steps

1. **Scan** — `HELPER scan --root "<REPO>" --out .review-repo/scan.json [--path <subfolder>] [--max-files 40]`
   (omit `--root` when `REPO` is the current working directory).
   Exit 1 with `not a directory`: the path is wrong — tell the user and stop.
   The JSON on stdout has: `totals`, `languages`, `skippedByReason`, `signals` (readme, CI,
   manifests and missing lockfiles, test counts, sensitive files, secret candidates, TODOs,
   large files, git hotspots, committed build artifacts, large binaries), `context` (docs,
   manifests and config to read first) and `priority` (code files to review, most important
   first, with their `ruleFiles`). Per-file data is in `scan.json` (`files[]`: `path`, `lines`,
   `language`, `ruleFiles`, `skipped`).
   The review skills' own folders (`**/skills/review-repo/**`, `**/skills/review-diff/**`,
   `**/skills/review-change/**`) are skipped as "review tooling"; add `--include-tooling` only
   when reviewing those skills.
   If the repo has more than ~2000 reviewable files and no sub-folder was given, tell the user
   that the review covers the `priority` files plus the scan signals, and that they can pass a
   sub-folder for a deeper pass.

2. **Understand the project** — read the `context` files (README, manifests, CI, Docker, config).
   Work out what the project does, its main parts and layers, how it is built, tested,
   configured and deployed. Write this as a 3–6 sentence `overview` (plain Markdown).

3. **Load rules** — read `<SKILL_ROOT>/rules/repo.md` and every rule file named in the
   `ruleFiles` of the `priority` files, each once. Use only rules with `status: active`. The
   language rules were written for diffs ("a changed function…"); apply them to existing code.

4. **Repository-level review** — go through the `REPO-*` rules using the scan signals.
   Verify every signal before reporting it: open the line of each secret candidate, check that a
   "missing lockfile" belongs to an application and not a library, check what CI really runs.
   **Never copy a secret value into a finding** — refer to the file and line and say what kind
   of secret it is.

5. **File-level review** — read the `priority` files in full, in batches of about 10. While
   reading, follow imports when you need them to judge structure (layering, duplication,
   dead code) and use Grep to check whether a problem repeats across the repo.
   For each issue:
   - Report real problems you can point to, not style preferences. Fewer, well-founded
     findings beat many weak ones.
   - Anchor it to the line numbers you saw when reading the file (`line`, optional `startLine`
     for a range). Never guess a line number.
   - Cite exactly one `ruleId`: the most specific language rule, else `GEN-*`, else `REPO-*`.
     Never invent rule ids. If no rule fits, do not report it.
   - Write `body` as 1–4 sentences of Markdown: what is wrong, why it matters (from the rule's
     `why`), what to do.
   - Add `suggestion` only when you can show the fixed code; it is shown as a "Suggested fix"
     block, not applied.
   - Same problem in several places: report the most important occurrence and list the others in
     `related` (`[{ "path": "...", "line": 12 }]`) instead of repeating the finding.
   - Repository-wide problems (no tests, no CI, missing lockfile) are `"general": true`, with an
     optional `path` when one file is the natural place (e.g. the manifest). A general finding
     may only cite `GEN-*` / `REPO-*` rules, or the language rules of its `path`.
   - Severity: use the rule's default unless the concrete case is clearly more or less serious.

6. **Write findings** — save `.review-repo/findings.json`:

   ```json
   {
     "overview": "Express REST API for orders with a React admin UI in `web/`. Data in PostgreSQL via Knex; deployed with Docker on GitLab CI.",
     "reviewed": ["src/server.js", "src/orders/service.js"],
     "findings": [
       {
         "general": true,
         "path": "package.json",
         "ruleId": "REPO-002",
         "title": "No automated tests",
         "body": "There are 84 source files and no tests or `test` script, so every change is verified by hand. Start with unit tests for `src/orders/service.js`, the most changed file."
       },
       {
         "path": "src/orders/service.js",
         "startLine": 40,
         "line": 44,
         "ruleId": "JS-006",
         "severity": "major",
         "title": "Promise rejection not handled",
         "body": "`sendInvoice()` is called without `await` or `.catch()`, so a failed e-mail crashes the process with an unhandled rejection.",
         "suggestion": "await sendInvoice(order);",
         "related": [{ "path": "src/orders/refunds.js", "line": 18 }]
       }
     ]
   }
   ```

   Required per finding: `ruleId`, `title`, `body`, plus `path` and `line` unless `general`.
   `reviewed` lists every file you read in full (findings' files are added automatically).

7. **Validate** — `HELPER validate .review-repo/scan.json .review-repo/findings.json --out .review-repo/review.json`
   Exit 1 lists `invalid` entries with the reason (unknown rule, rule not valid for the file's
   language, line past the end of the file, unknown path, duplicate). Fix them — re-read the
   file for line numbers, never guess — and run validate again.

8. **Render** — `HELPER render .review-repo/review.json --out <output-path>`

9. **Report** to the user, briefly:
   - output path and the reviewed `REPO`; files reviewed of reviewable files;
   - findings per severity and the top 3 (file:line — rule — title);
   - if `.review-repo/` or the report are not in the `.gitignore` of the current working
     directory, suggest adding them (do not edit `.gitignore` yourself).

Do not paste the whole report into the chat.
