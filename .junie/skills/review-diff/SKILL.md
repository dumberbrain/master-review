---
name: review-diff
description: Review a GitHub pull request or GitLab merge request diff that the user pastes into chat (or gives as a .diff file) and write review.md with copy-paste comments (file, line, severity, rule, suggested code). Never posts anything. Use when the user pastes a diff and wants it reviewed, or runs /review-diff.
argument-hint: [diff-file] [output-path]
allowed-tools: Read, Write, Bash(node:*)
---

# Review a pasted diff into `review.md`

You review a unified diff from a GitHub pull request or GitLab merge request against this
skill's rule files and write `review.md`. Every comment in it can be copied into the
GitHub/GitLab web UI by hand. **You never post, comment, approve or push anything.**

## Setup

- `SKILL_ROOT` = this skill's base directory: the folder that holds this `SKILL.md` and
  `bin/`, `lib/`, `rules/` (e.g. `.claude/skills/review-diff`, `.agents/skills/review-diff`).
- `HELPER` = `node "<SKILL_ROOT>/bin/review.mjs"` — always quote paths, they may contain spaces.
  The helper needs Node.js >= 18 and a shell; it has no dependencies.
- `WORK` = `.review-comment/` in the current working directory. Keep it after the run.
- Arguments: in Claude Code they arrive as `$ARGUMENTS` (`[diff-file] [output-path]`); in other
  agents take them from the user's message. Output path: the second argument, default
  `./review.md`.

## Step 0: get the diff

- If the first argument is a path to an existing `.diff` / `.patch` file, use it as `DIFF`.
- Otherwise take the diff the user pasted in the conversation and Write it **verbatim** to
  `.review-comment/input.diff` (no reformatting, no trimming of lines) — that is `DIFF`.
- Platform: `gitlab` if the user says GitLab / the paste came from a GitLab MR, otherwise
  `github`. It only changes the "where to paste" hints and the suggestion syntax.
- No diff given: tell the user how to get one and stop:
  - GitHub: open `https://github.com/<owner>/<repo>/pull/<n>.diff`, copy all.
  - GitLab: open `https://<host>/<group>/<project>/-/merge_requests/<n>.diff`, copy all.
  - Local: `git diff main...HEAD`.

## Steps

1. **Parse** — `HELPER parse "<DIFF>" --out .review-comment/mr.json --platform <github|gitlab> --title "<short title>"`
   - Exit 1: not a git diff (needs `diff --git a/... b/...` headers). Show the message, ask the
     user for the full `.diff` output, write no `review.md`, and stop.
   - Rule config: the helper uses `./review.config.json` when it exists. If the user names
     another config file, add `--config "<file>"`.
   - Exit 1 naming a config or rule file: show the message and stop; the user must fix it.
   - The JSON on stdout lists `reviewable` files with their `ruleFiles` and commentable
     `lines`, `skippedFiles` with reasons, and `rules` (enabled `packs`, `files`,
     `overrides`). Read it.

2. **Load rules** — read each path in `rules.files` once (keys are rule file ids like
   `owasp/general.md`, values are the paths to read). Each reviewable file may only cite rules
   from the ids in its own `ruleFiles`. Use only rules with `status: active`, then apply
   `rules.overrides` on top of the files: `status: retired` there means never cite the rule,
   and `severity` there replaces the rule's default.

3. **Review** — read the patches in `.review-comment/mr.json` (`files[].patch`), in batches of
   about 10 files for large diffs. For each issue you find:
   - Report only problems **introduced or touched by this diff**, not old code around it.
   - Anchor it to new-side line numbers from the file's `lines` / `validLines`
     (`HELPER lines .review-comment/mr.json <path>` prints them). If an issue is real but not
     on a commentable line, make it a general note (`"general": true`).
   - Cite exactly one `ruleId`. Prefer a rule from a language rule file; use a rule from a
     `general` file (e.g. `GEN-*`) only when no language rule fits. Never invent rule ids. If no rule fits at all, do not report it.
   - Write `body` as a short, friendly review comment in Markdown: what is wrong, why it
     matters (from the rule's `why`), and what to do. 1–4 sentences. No rule-file text dumps.
   - Add `suggestion` only when it is a drop-in replacement for exactly lines
     `startLine..line` (or `line`) of the new file. Keep the file's indentation (tabs or
     spaces). If the fix is not a direct replacement, either omit `suggestion` or set
     `"dropIn": false` and give an illustrative snippet.
   - Do not report the same problem twice; for a repeated pattern report the first occurrence
     and mention the others in its body.
   - Skip files listed in `skippedFiles`.
   - Severity: use the rule's default unless the concrete case is clearly more or less serious.

4. **Write findings** — save a JSON array to `.review-comment/findings.json`:

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
       "body": "Please add tests for the 100-unit threshold, including exactly 100."
     }
   ]
   ```

   `startLine` is optional (single-line findings omit it). Required: `path` (unless general),
   `line` (unless general), `ruleId`, `title`, `body`.

5. **Validate** — `HELPER validate .review-comment/mr.json .review-comment/findings.json --out .review-comment/review.json`
   - Exit 1 lists `invalid` findings with the reason: fix those entries (rule not in the
     file's `ruleFiles`, rule from a disabled pack, unknown rule id, bad fields) and run validate again. Never "fix" a line
     number by guessing — re-read the patch, or turn the finding into a general note.
   - `unmapped` findings are kept and shown in a separate section; that is fine.

6. **Render** — `HELPER render .review-comment/review.json --out <output-path>`

7. **Report** to the user, briefly:
   - output path and platform;
   - files reviewed / skipped (with reasons in one line if any);
   - findings per severity, and the top 3 findings (file:line — rule — title);
   - remind that comments are pasted manually: each finding says where to click.

Do not paste the whole `review.md` into the chat.
