# review-repo

Reviews a whole repository, or one sub-folder of it, and writes `repo-review.md`. The report
contains:

- an overview of the project;
- repository-level problems;
- prioritized findings with file and line;
- an honest list of what was and was not read.

The reviewed code is never changed.

- [Quick start](#quick-start)
- [When to use it](#when-to-use-it)
- [What happens during a run](#what-happens-during-a-run)
- [Scan signals](#scan-signals)
- [Which files are read](#which-files-are-read)
- [Reading repo-review.md](#reading-repo-reviewmd)
- [Secrets](#secrets)
- [Large repositories and monorepos](#large-repositories-and-monorepos)
- [Helper CLI reference](#helper-cli-reference)
- [Troubleshooting](#troubleshooting)

## Quick start

Install the skill (see [agents.md](agents.md#installing)) and open your agent in the
repository where it is installed. Then review that repository, or another one by its path:

```text
/review-repo                          (Claude Code: whole repository → repo-review.md)
/review-repo src/api                  (only src/api)
/review-repo . audit.md               (whole repository, custom output file)
/review-repo ../shop-api              (another repository → repo-review-shop-api.md here)
/review-repo "C:/work/shop-api" api   (only api/ of another repository)
```

In other agents, ask: *"Run the review-repo skill on this repository"*, *"…on `src/api`"* or
*"…on the repository in `../shop-api`"*.

When you review another repository, the work folder `.review-repo/` and the report are written
to the current working directory. Nothing is written into the reviewed repository. Links in the
report are relative paths into it, so they open in the IDE. A path that is absolute or starts
with `..` is treated as the repository to review; any other folder argument is a sub-folder.

## When to use it

- Onboarding to an unfamiliar codebase. The overview and the hotspots show where to start.
- Taking over or auditing a service, for example before a release or a security review.
- Planning technical-debt work, with findings ranked by severity.
- Checking that a template or starter repository follows the team rules.

For reviewing a single change, use [`review-diff`](review-diff.md) or, with the project on
disk, [`review-change`](review-change.md) instead.

## What happens during a run

1. **Scan.** The helper inventories the repository. It uses `git ls-files` when the folder is a
   git work tree, so `.gitignore` is honoured. Otherwise it walks the folder and skips
   `node_modules`, `dist`, `build` and similar. For every file it records the language, the
   line count, the applicable rule files and a skip reason (binary, lock/generated file,
   larger than 1 MB, the review tools themselves, previous reports). It then computes the
   [scan signals](#scan-signals) and picks the [priority files](#which-files-are-read).
2. **Understand the project.** The agent reads the `context` files: README and other top-level
   docs, manifests, CI, Docker and config. It then writes a short overview of the project's
   purpose, structure, build, tests and deployment.
3. **Load rules.** The agent reads the `general` rule files of the enabled packs (including
   `repo/repo.md`) and the language rule files of the priority files.
4. **Repository-level review.** The agent checks every `REPO-*` rule against the scan signals.
   It verifies each signal before reporting it. For example, it opens the line of a secret
   candidate, and it checks that a missing lockfile belongs to an application and not a
   library.
5. **File-level review.** The agent reads the priority files in full and follows imports where
   structure matters. It uses search to see whether a problem repeats. A repeated problem is
   reported once, with the other places listed under "Also here".
6. **Validate.** The helper checks every finding:
   - the rule exists and fits the file's language;
   - the file is in the scan;
   - the line range lies within the file;
   - there are no duplicates.

   It also captures the code snippet. Invalid findings go back to the agent.
7. **Render.** The helper writes the report.

Work files: `.review-repo/` (`scan.json`, `findings.json`, `review.json`). Add the folder and
`repo-review.md` to `.gitignore`.

## Scan signals

Signals are facts, not findings. The agent must confirm each one by reading the files.

| Signal | What it is | Typical rule |
|-|-|-|
| `readme` | top-level README, if any | REPO-004 |
| `gitignore` | whether `.gitignore` exists | REPO-007 |
| `ci` | CI files (GitHub Actions, GitLab CI, Azure Pipelines, Jenkins, CircleCI, `.ci-cd/`, …) | REPO-003 |
| `manifests` | `package.json`, `go.mod`, `*.csproj`, `pom.xml`, `pyproject.toml`, … with their nearest lockfile | REPO-005 |
| `missingLockfiles` | manifests of ecosystems that use lockfiles but have none | REPO-005 |
| `tests` | number of test files vs. other code files | REPO-002 |
| `sensitiveFiles` | `.env*` (not `.example`), keys, keystores, `.npmrc`, … | REPO-001 |
| `secretCandidates` | lines that look like keys, tokens, passwords or connection-string passwords, **with the value redacted** | REPO-001, GEN-009 |
| `todos` | TODO / FIXME / HACK counts per file | REPO-009 |
| `largeFiles` | code files with 400+ lines | REPO-008, GEN-002 |
| `hotspots` | files changed most often in the last 12 months (git only, at least 2 changes) | REPO-008 |
| `buildArtifacts` | tracked `dist/`, `build/`, `obj/`, `bin/Debug`, source maps, … | REPO-006 |
| `largeBinaries` | binary files of 1 MB or more | REPO-006 |

## Which files are read

`priority` lists the code files to read in full, 40 by default. They are ranked by:

- entry points (`main`, `index`, `app`, `server`, `Program.cs`, `*Application.java`, …);
- git change frequency;
- size;
- whether language rules exist for the file.

Test files are ranked lower.

The report's **Coverage** section shows the number of files read, the files read, and the
high-priority files that were not read. Anything outside that list was covered only by the
scan signals.

## Reading repo-review.md

| Section | Content |
|-|-|
| Header | path, scope, commit and branch, date, coverage (files read / reviewable files) |
| Overview | what the project is and how it is built, tested and deployed |
| Summary | counts per severity and the top five issues (blocker and major first), with links |
| Repository-level findings | problems about the repository as a whole (`"general": true`) |
| Findings by file | grouped by file, worst file first; each with a link to the line, explanation, code snippet, "Also here" links and an optional suggested fix |
| Coverage | files reviewed, and high-priority files not reviewed |
| Scan facts | languages, test counts, CI, README and `.gitignore`, manifests and lockfiles, skipped files |

Links are relative to the report, so they open the file at the line in VS Code, JetBrains IDEs
and on GitHub/GitLab.

## Secrets

- The scanner never writes a secret value. Candidates show the first four characters and the
  length, e.g. `sk_l… (14 chars)`.
- The skill tells the agent never to repeat a secret in a finding. Findings name the file,
  the line and the kind of secret.
- Placeholders such as `${VAR}`, `<your-key>` or `changeme` are ignored.
- Rule documentation and test fixtures can still show up as candidates. The agent verifies
  them and drops the false positives.
- If a real secret is reported, **rotate it first**. Removing it from the repository does not
  remove it from git history (see REPO-001).

## Large repositories and monorepos

- Pass a sub-folder (`/review-repo services/billing`) to review one part in depth. Paths in
  the report stay relative to the repository root.
- Run the skill once per area, with different output files, for a full picture.
- The agent tells you when the repository has more than about 2000 reviewable files and the
  review covers only the priority files.

## Helper CLI reference

`node .claude/skills/review-repo/bin/review-repo.mjs <command>` (the path depends on where the
skill is installed). Output is JSON on stdout. Exit code 0 means success, 1 means invalid
input.

| Command | Purpose |
|-|-|
| `scan --out <scan.json> [--root <dir>] [--path <subdir>] [--max-files <n>] [--no-git] [--include-tooling] [--config <file>]` | inventory + signals + priority + rule set. stdout omits the per-file list; `scan.json` has it |
| `validate <scan.json> <findings.json> --out <review.json> [--config <file>]` | check findings and capture snippets; writes nothing if any finding is invalid. Uses the config recorded by `scan` unless `--config` is given |
| `render <review.json> --out <repo-review.md>` | write the report; links are relative to the output file |
| `rules [--config <file>]` | print the effective rule config, including the `repo` pack, and lint problems; exit 1 on problems |

`--config` defaults to `./review.config.json` in the current working directory, never in the
reviewed repository. See [rules.md](rules.md#project-config-reviewconfigjson).

`--no-git` forces a folder walk. `--include-tooling` also scans the review skills' own folders.
You only need it when reviewing this repository.

Findings file (`findings.json`):

```json
{
  "overview": "Markdown, 3–6 sentences",
  "reviewed": ["src/server.js"],
  "findings": [
    { "general": true, "path": "package.json", "ruleId": "REPO-005", "title": "…", "body": "…" },
    {
      "path": "src/orders/service.js", "startLine": 40, "line": 44,
      "ruleId": "JS-006", "severity": "major", "title": "…", "body": "…",
      "suggestion": "await sendInvoice(order);",
      "related": [{ "path": "src/orders/refunds.js", "line": 18 }]
    }
  ]
}
```

| Field | Required | Notes |
|-|-|-|
| `ruleId`, `title`, `body` | yes | any active rule that applies to the file; `REPO-*` and `GEN-*` apply everywhere |
| `path`, `line` | yes, unless `general` | `line` must be within the file; `startLine` optional |
| `general` | no | repository-wide finding; `path` optional; may cite only `GEN-*`, `REPO-*` or the language rules of `path` |
| `severity` | no | defaults to the rule's severity |
| `suggestion` | no | shown as "Suggested fix", never applied |
| `related` | no | other places with the same problem: `[{ "path", "line"? }]` |
| `reviewed` | no | files read in full; the files of findings are added automatically |

## Troubleshooting

| Problem | Cause / fix |
|-|-|
| The skill's own files show up in the review | they are skipped by default (`**/skills/review-repo/**`, `**/skills/review-diff/**`, `**/skills/review-change/**`). If they still appear, the skill is installed in an unusual folder |
| `not a directory` when reviewing another repository | the path is wrong. Use an absolute path, or one relative to the current working directory |
| The agent asks to approve reading files outside the working directory | expected in Claude Code when the reviewed repository is elsewhere. Allow read access to that folder |
| Few files reviewed | expected on large repositories. Pass a sub-folder, or raise `--max-files` |
| Many secret candidates in docs or tests | the agent should verify and drop them. Check the findings, not the scan |
| "rule … does not apply to …" | the agent cited a rule for another language. It has to pick a rule that fits the file |
| "line … is past the end of …" | the line number was wrong. The agent must re-read the file, not guess |
| No hotspots | the folder is not a git repository, or nothing changed twice in the last 12 months |
