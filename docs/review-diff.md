# review-diff

Reviews a GitHub pull request or GitLab merge request diff and writes `review.md`. The file
has one comment per finding that you copy into the PR/MR by hand. Nothing is posted
automatically.

- [Quick start](#quick-start)
- [Getting the diff](#getting-the-diff)
- [Running it](#running-it)
- [What happens during a run](#what-happens-during-a-run)
- [Reading review.md](#reading-reviewmd)
- [Pasting comments](#pasting-comments)
- [Helper CLI reference](#helper-cli-reference)
- [Troubleshooting](#troubleshooting)

## Quick start

```text
/review-diff                       (Claude Code: then paste the diff)
/review-diff pr-42.diff            (a diff file)
/review-diff pr-42.diff pr-42.md   (custom output path)
```

In other agents, ask: *"Review this diff with the review-diff skill"* and paste the diff, or
name a file. Then open `review.md`.

## Getting the diff

The skill needs a **unified git diff**, the format that starts every file with
`diff --git a/… b/…`.

| Source | How |
|-|-|
| GitHub PR | open `https://github.com/<owner>/<repo>/pull/<n>.diff`, copy everything (or save it as a file) |
| GitLab MR | open `https://<host>/<group>/<project>/-/merge_requests/<n>.diff` |
| Local branch | `git diff main...HEAD > changes.diff` |
| GitHub CLI | `gh pr diff <n> > pr.diff` |
| GitLab CLI | `glab mr diff <n> > mr.diff` |

Text copied from the "Files changed" page of the web UI is **not** a diff and is rejected.

For large diffs, save the diff to a file and pass the path. When you paste, the agent must
first write the whole diff to `.review-comment/input.diff`. That costs time and tokens, and a
file avoids any risk of the text being altered.

## Running it

Arguments, all optional:

| Position | Meaning | Default |
|-|-|-|
| 1 | path to a `.diff` / `.patch` file | the diff pasted into the chat |
| 2 | output path | `./review.md` |

Say **"GitLab"** when the diff comes from a GitLab MR. The platform changes two things: the
"where to paste" instructions and the suggestion syntax (`suggestion:-N+0` on GitLab).

## What happens during a run

1. **Parse.** The helper splits the diff into files. It skips the following, with a reason:
   - deleted files;
   - binaries and files without a patch;
   - lock files, minified files and generated files (see `skip` in `rules/languages.json`).

   For every other file it lists the rule files that apply and the **commentable lines**:
   new-side lines that were added or shown as context. Only these lines can carry a comment in
   GitHub or GitLab.
2. **Load rules.** The agent reads the rule files the parse step listed, each once.
3. **Review.** The agent reads the patches. For each problem introduced or touched by the diff,
   it records a finding. A finding has a file and line, exactly one rule id, a short comment
   and, where possible, a drop-in code suggestion. Problems in untouched code are not
   reported.
4. **Validate.** The helper checks every finding:
   - the rule exists and is active;
   - the rule applies to the file's language;
   - the line (or line range) is commentable and inside a single hunk.

   Invalid findings are sent back to the agent to fix. Findings whose line is not in the diff
   are kept as **not anchored** notes.
5. **Render.** The helper writes `review.md`.
6. **Report.** The agent tells you the output path, the counts per severity and the top
   three findings.

Work files stay in `.review-comment/` (`input.diff`, `mr.json`, `findings.json`,
`review.json`). They can be useful for re-rendering or debugging. Add the folder to
`.gitignore`.

## Reading review.md

~~~markdown
# Code Review — <title>

| Source | pasted diff (`…/input.diff`) |
| Platform | GitHub |
| Reviewed at | 2026-11-25T10:00:00.000Z |

## Summary
- Files reviewed: 12 · skipped: 2
- Findings: blocker 0 · major 2 · minor 3 · suggestion 1
<details> Skipped files … </details>

## Findings
### `src/orders/service.ts`
#### 1. [major] TS-005 — Floating promise · line 42
**Where to paste**: GitHub — in **Files changed**, hover line 42 and click **+**.
**Comment** (copy everything inside the box):
  ```markdown
  **[major] TS-005 — Floating promise**
  …explanation…
  ```suggestion
  await this.mailer.send(order);
  ```
  ```

## Not anchored / general notes
#### 7. [minor] GEN-011 — New logic without tests
**File**: `src/orders/service.ts` — add as a general merge request comment.
~~~

- Findings are grouped by file, in diff order, and sorted by line.
- **Suggestion blocks** are drop-in replacements for exactly the commented lines. GitHub and
  GitLab show an "Apply suggestion" button for them. When a fix is not a direct replacement,
  the code is shown as a normal code block instead.
- **Not anchored / general notes** are findings that do not belong on a single diff line,
  such as missing tests, or that point at a line outside the diff. Post them as a general
  PR/MR comment.

## Pasting comments

GitHub:

1. Open the PR → **Files changed**.
2. For a single line, hover the line number and click **+**. For a range, click the first
   line, shift-click the last line, then click **+**.
3. Paste the content of the comment box and choose **Add single comment** or **Start a
   review**.

GitLab:

1. Open the MR → **Changes**.
2. Comment on the line given in "Where to paste". For a range, the suggestion header already
   says how many lines above it replaces (`suggestion:-2+0`).
3. Paste the comment box content.

You can edit or drop any comment before pasting. The report is a draft, not a verdict.

## Helper CLI reference

`node .claude/skills/review-diff/bin/review.mjs <command>` (the path depends on where the skill
is installed). Output is JSON on stdout. Exit code 0 means success, 1 means invalid input.

| Command | Purpose |
|-|-|
| `parse <file.diff> --out <mr.json> [--platform github\|gitlab] [--title <text>]` | split the diff, attach rule files and commentable lines; prints the reviewable and skipped files |
| `lines <mr.json> [path]` | print the commentable line ranges and hunks of one or all files |
| `validate <mr.json> <findings.json> --out <review.json>` | check findings; prints the counts and an `invalid` list; writes nothing if any finding is invalid |
| `render <review.json> --out <review.md>` | write the Markdown report |

Findings file (`findings.json`): a JSON array.

| Field | Required | Notes |
|-|-|-|
| `path` | yes, unless `general` | new path of the file in the diff |
| `line` | yes, unless `general` | new-side line number; the last line of a range |
| `startLine` | no | first line of a multi-line range, within the same hunk |
| `ruleId` | yes | e.g. `TS-005`; must apply to the file's language |
| `title` | yes | short headline |
| `body` | yes | 1–4 sentences of Markdown |
| `severity` | no | defaults to the rule's severity |
| `suggestion` | no | replacement code for `startLine..line` |
| `dropIn` | no | `false` when `suggestion` is illustrative, not a direct replacement |
| `general` | no | `true` for a note that is not tied to a line |

## Troubleshooting

| Problem | Cause / fix |
|-|-|
| "is not a unified git diff" | the text has no `diff --git` headers. Use the `.diff` URL or `git diff`, not text copied from the web page |
| A file is missing from the review | check "Skipped files" in the report: deleted, binary, lock/generated files and files without added lines are skipped by design |
| Many "not anchored" findings | the agent commented on lines outside the diff. Those are kept as general notes; ask the agent to re-anchor them to changed lines |
| A suggestion does not apply cleanly | the indentation or the range was off. Edit the suggestion before pasting, or remove the `suggestion` fence |
| `node: command not found` | install Node.js >= 18 and make sure the agent's shell can find it |
| File names with non-ASCII characters | supported: git's quoted paths (`"a/s\311\231b\311\231t.js"`) are decoded |
