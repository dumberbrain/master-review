---
name: review-diff
description: Review a GitHub pull request or GitLab merge request diff that the user pastes into chat (or gives as a .diff file) and write review.md with copy-paste comments (file, line, severity, rule, suggested code). Never posts anything. Use when the user pastes a diff and wants it reviewed, or runs /review-diff.
argument-hint: [diff-file] [output-path]
allowed-tools: Read, Write, Bash(node:*)
---

# Review a pasted diff into `review.md`

You review a unified diff from a GitHub PR or GitLab MR against this skill's rules and write
`review.md`; each comment can be pasted into the web UI by hand. **You never post, comment,
approve or push anything.**

Goal: **few comments, each one real.** A missed nit costs nothing; a wrong comment costs the
author's trust. Read only what the steps say — the helper has already done the parsing.

## Setup

- `SKILL_ROOT` = the folder holding this `SKILL.md`. `HELPER` = `node "<SKILL_ROOT>/bin/review.mjs"`
  (Node.js >= 18, no dependencies; always quote paths).
- `WORK` = `.review-comment/` in the current working directory. Keep it after the run.
- Arguments (`$ARGUMENTS` in Claude Code; in other agents take them from the user's message):
  `[diff-file] [output-path]`, output default `./review.md`.
- Platform: `gitlab` if the user says GitLab, otherwise `github`.

## Step 0: get the diff

- A path to an existing `.diff` / `.patch` file → that is `DIFF` (cheapest; prefer it).
- Otherwise Write the pasted diff **verbatim** to `.review-comment/input.diff` → `DIFF`.
- No diff: tell the user how to get one and stop — GitHub `https://github.com/<owner>/<repo>/pull/<n>.diff`,
  GitLab `https://<host>/<group>/<project>/-/merge_requests/<n>.diff`, local `git diff main...HEAD > pr.diff`.

## Steps

1. **Parse** — `HELPER parse "<DIFF>" --out .review-comment/mr.json --platform <github|gitlab> --title "<short title>"`
   (add `--config "<file>"` if the user names a rule config; `./review.config.json` is used
   when it exists). Exit 1: show the message and stop (not a git diff → ask for the full
   `.diff`; config/rule error → the user must fix it).
   Stdout gives `rules.index` (the rule index file), `batches` (patch files, riskiest first),
   `risk` (tags per file) and `skippedFiles` (already triaged out: never review them).
   **Do not read `mr.json`**; the batches contain everything you need.

2. **Read the rule index** — read `rules.index` once. One line per active rule:
   `ID severity · title — look-for`, grouped by rule file and language; overrides are
   already applied. A file may cite only rules from sections whose language is in its
   `rules:` list.

3. **Review batch by batch** — read each `batches[].file` in order. Each file starts with
   `### path [change · rules: … · risk: …]`; then every line with a number is commentable
   (`N +code` added, `N  code` context), lines without a number (`   -code`) were removed.
   - Spend attention where `risk` points (auth, injection, html, secrets, crypto, data…), but
     check every added line.
   - Report only problems **introduced or touched by this diff**, never old code around it.
   - Anchor to the numbers shown. An issue not on a numbered line → `"general": true`.
   - Cite exactly one `ruleId` from the index; prefer a language rule over a `GEN-*` one. No
     fitting rule → do not report it. Never invent ids.
   - Before citing a rule whose `why`/`fix` you cannot state precisely, run
     `HELPER rule <ID> [ID…]` (prints why, fix, example). Only for rules you will cite.
   - Same problem repeated → one finding at the first occurrence, others named in its body.

4. **Verify, then write findings** — for each candidate, re-read its numbered lines and ask:
   is it really wrong in this code (not just possibly)? would a senior reviewer on this team
   leave this comment? Drop it if not. Then set `confidence`:
   `high` — certain from the shown code; `medium` — very likely, depends on code not shown;
   `low` — a guess (the helper drops these; better not to write them). Save
   `.review-comment/findings.json`:

   ```json
   [
     { "path": "src/Orders/OrderService.cs", "startLine": 42, "line": 45, "ruleId": "CS-001",
       "severity": "major", "confidence": "high", "title": "Async void method",
       "body": "Exceptions thrown here can't be caught by callers and will crash the process. Return `Task` instead.",
       "suggestion": "public async Task SaveAsync()\n{\n    await _repo.SaveAsync(order);\n}" },
     { "general": true, "path": "src/Orders/OrderService.cs", "ruleId": "GEN-011", "confidence": "medium",
       "title": "New discount logic has no tests", "body": "Please add tests for the 100-unit threshold, including exactly 100." }
   ]
   ```

   - Required: `ruleId`, `title`, `body`, and `path` + `line` unless general. `startLine` only
     for ranges. `severity` defaults to the rule's; change it only when the case is clearly
     more or less serious.
   - `body`: 1–4 friendly sentences — what is wrong, why it matters, what to do. No rule text dumps.
   - `suggestion` only as a drop-in replacement for exactly `startLine..line`, with the file's
     indentation; otherwise omit it or add `"dropIn": false` for an illustrative snippet.

5. **Validate** — `HELPER validate .review-comment/mr.json .review-comment/findings.json --out .review-comment/review.json`
   - Exit 1 lists `invalid` entries with reasons: fix them and rerun. Never guess a line
     number — re-read the batch, or make the finding general.
   - `unmapped` findings are kept in a separate section. `dropped` lists findings left out
     for precision (low confidence, or `suggestion`s over the limit of 3, the most confident
     kept; `--max-suggestions <n>` only if the user asks for more nits).

6. **Render** — `HELPER render .review-comment/review.json --out <output-path>`

7. **Report** briefly: output path and platform; files reviewed / skipped (reasons in one
   line); findings per severity and how many were dropped; top 3 findings
   (file:line — rule — title); comments are pasted manually, each says where to click.
   Do not paste `review.md` into the chat.
