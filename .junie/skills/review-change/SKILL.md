---
name: review-change
description: Review a GitHub pull request or GitLab merge request diff together with the full project it belongs to (the user gives a diff file and the project folder), and write review.md with copy-paste comments (file, line, severity, rule, suggested code). Uses the project to check callers, tests, conventions and existing helpers that the diff alone does not show. Never posts anything and never changes the project. Use when the user gives both a diff and a project path, or runs /review-change.
argument-hint: <diff-file> <project-path> [output.md]
allowed-tools: Read, Write, Glob, Grep, Bash(node:*)
---

# Review a diff with its project into `review.md`

You review a unified diff from a GitHub pull request or GitLab merge request against this
skill's rule files, using the whole project to understand the change, and write `review.md`.
Every comment in it can be copied into the GitHub/GitLab web UI by hand.

**You never post, comment, approve or push anything, and the project is read-only:** do not
edit files in it, do not run git commands that change it (checkout, stash, pull, reset), and
do not build or run its code or tests. The only files you write are under `.review-change/`
and the report, both in the current working directory.

## Setup

- `SKILL_ROOT` = this skill's base directory: the folder that holds this `SKILL.md` and
  `bin/`, `lib/`, `rules/` (e.g. `.claude/skills/review-change`, `.agents/skills/review-change`).
- `HELPER` = `node "<SKILL_ROOT>/bin/review.mjs"` (parse, lines, validate, render) and
  `CONTEXT` = `node "<SKILL_ROOT>/bin/context.mjs"` (project facts). Always quote paths, they
  may contain spaces. Both need Node.js >= 18 and a shell; they have no dependencies.
- `WORK` = `.review-change/` in the current working directory. Keep it after the run.
- Arguments (in Claude Code `$ARGUMENTS`; in other agents take them from the user's message):
  - `DIFF` — path to a `.diff` / `.patch` file. If the user pasted the diff instead, Write it
    **verbatim** to `.review-change/input.diff` (no reformatting, no trimming) and use that.
  - `PROJECT` — path to the project folder: the repository root that the diff's paths are
    relative to. If none is given, use the current working directory only when it contains
    the changed files; otherwise ask the user for the path and stop.
  - Output path — an argument ending in `.md`; default `./review.md`.
- Platform: `gitlab` if the user says GitLab / the diff came from a GitLab MR, otherwise
  `github`. It only changes the "where to paste" hints and the suggestion syntax.
- No diff given: tell the user how to get one and stop:
  - GitHub: open `https://github.com/<owner>/<repo>/pull/<n>.diff`, copy all.
  - GitLab: open `https://<host>/<group>/<project>/-/merge_requests/<n>.diff`, copy all.
  - Local: `git diff main...HEAD` in the project.

## Steps

1. **Parse** — `HELPER parse "<DIFF>" --out .review-change/mr.json --platform <github|gitlab> --title "<short title>"`
   - Exit 1: not a git diff (needs `diff --git a/... b/...` headers). Show the message, ask
     for the full `.diff` output, write no report, and stop.
   - Rule config: the helper uses `./review.config.json` (current working directory) when it
     exists. If the user names another config file, add `--config "<file>"`.
   - Exit 1 naming a config or rule file: show the message and stop; the user must fix it.
   - The JSON lists `reviewable` files with their `ruleFiles` and commentable `lines`,
     `skippedFiles` with reasons, and `rules` (enabled `packs`, `files`, `overrides`).

2. **Project context** — `CONTEXT .review-change/mr.json --project "<PROJECT>" --out .review-change/project.json`
   The JSON has `structure` (folders with file counts), `context` (README, CI, config and
   manifests to read first), `checkout` with a `hint`, and `changed[]`: per changed file its
   `checkout`, `exists`, `lines` and `tests` (test files with a matching name).
   - `checkout` tells which version of the changed files the project folder holds:
     - `head` — the PR version: read changed files directly.
     - `base` — the version before the PR: read the file and apply its patch in your head;
       never comment on the base text as if it were the new code.
     - `mixed` / `differs` — check each file's `checkout`; for changed lines the patch is the
       truth, use the project only for surrounding code.
     - `missing` — the project path is wrong (not the repository root of the diff). Tell the
       user, ask for the right path, and stop.

3. **Understand the project** — read the `context` files and look at `structure`. Work out
   what the project does, its layers, and where each changed file sits (entry point, domain,
   data access, UI, config, tests). Read `AGENTS.md`, `CLAUDE.md` or `CONTRIBUTING.md` when
   present: they state the project's own conventions.

4. **Load rules** — read each path in `rules.files` once (keys are rule file ids like
   `owasp/general.md`, values are the paths to read). Each reviewable file may only cite rules
   from the ids in its own `ruleFiles`. Use only rules with `status: active`, then apply
   `rules.overrides` on top of the files: `status: retired` there means never cite the rule,
   and `severity` there replaces the rule's default.

5. **Review with the project** — for each reviewable file, in batches of about 10: read its
   patch in `.review-change/mr.json` (`files[].patch`), then the full file from `PROJECT`
   (see `checkout`). Then use the project to check what the diff alone cannot show:
   - **Callers and usages** — when the diff changes or removes a function, method, type,
     route, config key, DB column, event or message field, Grep the project for its users
     and check they still work (arguments, return values, null handling, renamed keys).
   - **Tests** — open the files in `tests`; check whether they cover the new behaviour or now
     assert the old one. No test for new logic in a project that has tests → `GEN-011`.
   - **Conventions** — compare with how neighbouring code does the same thing (error handling,
     validation, logging, auth checks, data access). A change that skips a check every
     sibling handler does is a real finding.
   - **Existing helpers** — Grep for code that already does what the new code does
     (duplication, `GEN-004`), and for the project's own wrappers the new code bypasses.
   - **Security** — follow the input from the changed handler to where it is used, and check
     the authorization and validation the rest of the project applies (see the security
     rules in `owasp/general.md`).

   For each issue:
   - Report only problems **introduced or made worse by this diff**. Old problems in unchanged
     code are out of scope, even when you see them while reading.
   - Anchor it to new-side line numbers of the diff (`HELPER lines .review-change/mr.json <path>`
     prints them). A problem that shows up in an unchanged file (a broken caller, an outdated
     test) is anchored to the changed line that causes it; name the affected `path:line` in
     the body. If there is no commentable line for it, make it a general note
     (`"general": true`).
   - Cite exactly one `ruleId`. Prefer a rule from a language rule file; use a rule from a
     `general` file (e.g. `GEN-*`) only when no language rule fits. Never invent rule ids. If no rule fits at all, do not report it.
   - Write `body` as a short, friendly review comment in Markdown: what is wrong, why it
     matters (from the rule's `why`), what to do. 1–4 sentences. When the evidence is in
     another file, say where ("`OrderController.cs:88` still passes the old `customerId`").
   - Add `suggestion` only when it is a drop-in replacement for exactly lines
     `startLine..line` (or `line`) of the new file. Keep the file's indentation. If the fix is
     not a direct replacement, omit `suggestion` or set `"dropIn": false`.
   - Do not report the same problem twice; for a repeated pattern report the first occurrence
     and mention the others in its body.
   - Skip files listed in `skippedFiles`.
   - Severity: use the rule's default unless the concrete case is clearly more or less serious.

6. **Write findings** — save a JSON array to `.review-change/findings.json`:

   ```json
   [
     {
       "path": "src/Orders/OrderService.cs",
       "startLine": 42,
       "line": 45,
       "ruleId": "CS-001",
       "severity": "major",
       "title": "Async void method",
       "body": "Exceptions thrown here can't be caught by callers and will crash the process. Return `Task` instead.",
       "suggestion": "public async Task SaveAsync()\n{\n    await _repo.SaveAsync(order);\n}"
     },
     {
       "general": true,
       "path": "src/Orders/OrderService.cs",
       "ruleId": "GEN-011",
       "title": "New discount logic has no tests",
       "body": "`tests/Orders/OrderServiceTests.cs` covers only the old flat rate. Please add tests for the 100-unit threshold, including exactly 100."
     }
   ]
   ```

   `startLine` is optional (single-line findings omit it). Required: `path` (unless general),
   `line` (unless general), `ruleId`, `title`, `body`.

7. **Validate** — `HELPER validate .review-change/mr.json .review-change/findings.json --out .review-change/review.json`
   - Exit 1 lists `invalid` findings with the reason: fix those entries and run validate
     again. Never "fix" a line number by guessing — re-read the patch, or turn the finding
     into a general note.
   - `unmapped` findings are kept and shown in a separate section; that is fine.

8. **Render** — `HELPER render .review-change/review.json --out <output-path>`

9. **Report** to the user, briefly:
   - output path, platform and project path;
   - the `checkout` state (and that changed files were read from the patch when it is not `head`);
   - files reviewed / skipped (with reasons in one line if any);
   - findings per severity, and the top 3 findings (file:line — rule — title);
   - remind that comments are pasted manually: each finding says where to click;
   - if `.review-change/` or the report are not in this repository's `.gitignore`, suggest
     adding them (do not edit `.gitignore` yourself).

Do not paste the whole `review.md` into the chat.
