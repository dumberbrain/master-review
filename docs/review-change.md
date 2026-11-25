# review-change

Reviews a GitHub pull request or GitLab merge request diff **together with the project it
belongs to**, and writes `review.md` with copy-paste comments. It works like
[`review-diff`](review-diff.md), but the agent can also open the rest of the project. That way
it checks what the diff alone cannot show:

- callers and usages of changed functions, types, routes and config keys;
- the tests of the changed files;
- the conventions of the neighbouring code;
- existing helpers that the new code duplicates or bypasses.

The project is read-only. The skill never changes, checks out, builds or runs it.

- [Quick start](#quick-start)
- [When to use it](#when-to-use-it)
- [What happens during a run](#what-happens-during-a-run)
- [Head or base: which version the project folder holds](#head-or-base-which-version-the-project-folder-holds)
- [Helper CLI reference](#helper-cli-reference)
- [Troubleshooting](#troubleshooting)

## Quick start

Get the diff as a file (see [review-diff.md](review-diff.md#getting-the-diff)). Then run the
skill from any repository where it is installed. The project can be anywhere on disk.

```text
/review-change pr-42.diff ../shop-api                 (Claude Code → ./review.md)
/review-change pr-42.diff "C:/work/shop-api" pr-42.md  (custom output file)
```

In other agents, ask: *"Review `pr-42.diff` with the review-change skill; the project is in
`../shop-api`"*.

The project path must be the **repository root** that the diff's paths are relative to. For
`diff --git a/src/orders/service.js …`, that is the folder that contains `src/`.

The work files (`.review-change/`) and the report are written to the current working
directory, not into the project.

## When to use it

| Use | When |
|-|-|
| `review-diff` | you only have the diff, or the change is small and self-contained |
| `review-change` | you have the project locally and the change touches shared code: signatures, data models, routes, config, security checks |
| `review-repo` | you want a review of the whole codebase, not of one change |

`review-change` reads more files, so it is slower and uses more tokens than `review-diff`.

## What happens during a run

1. **Parse.** The helper parses the diff into `.review-change/mr.json`, exactly like
   `review-diff`.
2. **Project context.** `context.mjs` describes the project in `.review-change/project.json`:
   - folder structure with file counts;
   - files to read first (README, `AGENTS.md`, CI, config, manifests);
   - for each changed file: whether it exists, its length, test files with a matching name,
     and which version of it the project holds (see the next section).
3. **Understand the project.** The agent reads the context files.
4. **Review.** The agent reads each patch and the full file from the project. It uses Grep to
   find callers, opens the tests, and compares the change with neighbouring code.
5. **Findings.** Only problems **introduced or made worse by the diff** are reported, and every
   comment is anchored to a diff line, because it has to be pasted into the PR. A problem that
   shows up elsewhere is anchored to the changed line that causes it and names the affected
   file. An example is a caller that still passes the old argument. Old problems in unchanged
   code are not reported.
6. **Validate and render.** These work the same as in `review-diff`. The report format is
   identical; see [Reading review.md](review-diff.md#reading-reviewmd).

## Head or base: which version the project folder holds

The project folder may be on the PR branch, or still on `main`. The helper compares every
changed file with both sides of the diff:

| `checkout` | Meaning | What the agent does |
|-|-|-|
| `head` | the project holds the PR version | reads changed files directly |
| `base` | the project holds the version before the PR | reads the file and applies the patch; unchanged files are current |
| `mixed` / `differs` | some files match neither side (another commit, local edits) | trusts the patch for changed lines and uses the project only for surrounding code |
| `missing` | none of the changed files exist | stops and asks for the right project path |
| `unknown` | nothing to compare (binary files only) | reviews from the patch |

For the most accurate review, check out the PR branch first, for example with
`gh pr checkout 42` in the project. The skill itself never runs git commands that change the
project.

## Helper CLI reference

The skill ships two helpers in `bin/`.

- `review.mjs` is the `review-diff` helper, copied by `npm run sync`. It has the same commands
  (`parse`, `lines`, `validate`, `render`); see
  [review-diff.md](review-diff.md#helper-cli-reference).
- `context.mjs` is this skill's own helper:

```text
node .claude/skills/review-change/bin/context.mjs <mr.json> --project <dir> --out <project.json> [--no-git]
```

| Field in `project.json` | Content |
|-|-|
| `root`, `fileSource`, `git` | project path; `git` or `walk` listing; head, branch and whether there are uncommitted changes |
| `totals` | number of files and test files |
| `checkout`, `hint` | overall state from the table above, with what to do |
| `structure` | folders up to two levels deep with file counts |
| `context` | files to read first |
| `changed[]` | `path`, `oldPath`, `changeType`, `reviewable`, `checkout`, `exists`, `lines`, `tests` |

Exit code 1: the project is not a directory, `--project` is missing, or `mr.json` was not
produced by `review.mjs parse`.

## Troubleshooting

| Symptom | Cause and fix |
|-|-|
| `checkout: missing` | the project path is not the repository root of the diff (for example you gave `src/` or a different repository) |
| `checkout: base` although you are on the PR branch | the branch is behind the diff: pull the latest commits, or regenerate the diff |
| `checkout: differs` for some files | local uncommitted edits (`git.dirty: true`), or the diff comes from another commit |
| The agent asks to approve reading files outside the working directory | expected in Claude Code when the project is elsewhere. Allow read access to the project folder |
| No tests listed for a changed file | tests are matched by file name (`service.js` → `service.test.js`, `OrderService.cs` → `OrderServiceTests.cs`). The agent still uses Grep to find tests with other names |
