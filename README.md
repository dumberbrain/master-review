# master-review

Code-review skills for Claude Code (`.claude/skills/`) and Junie (`.junie/skills/`). They only
write Markdown reports; nothing is posted, committed or changed in the reviewed code.

| Skill | What it reviews | Output |
|-|-|-|
| `review-diff` | a GitHub PR / GitLab MR diff you paste (or a `.diff` file) | `review.md` with copy-paste review comments (file, line, severity, rule, suggested code) |
| `review-repo` | the whole repository (or one sub-folder) | `repo-review.md` with prioritized findings: repository-level problems (secrets, tests, CI, lockfiles, structure) and file/line issues |

## review-diff

1. Get the diff:
   - GitHub: `https://github.com/<owner>/<repo>/pull/<n>.diff`
   - GitLab: `https://<host>/<group>/<project>/-/merge_requests/<n>.diff`
   - Local: `git diff main...HEAD`
2. In Claude Code (opened in this folder): `/review-diff` and paste the diff (say "GitLab" for MR diffs), or `/review-diff path/to/file.diff [output.md]`.
3. Open `review.md`.

Working files go to `.review-comment/`.

## review-repo

1. Install the skill in the repository you want to review (see below) and open Claude Code there.
2. Run `/review-repo`, `/review-repo src/api` (one sub-folder) or `/review-repo . audit.md` (other output file).
3. Open `repo-review.md`.

How it works: a helper scans the repo first (file inventory, languages, git hotspots, test and
CI presence, manifests without lockfiles, secret candidates, TODOs, committed build output)
and picks the files to read first. The model then reads the docs, config and priority files,
reviews them against the same rule files as `review-diff` plus `rules/repo.md` (`REPO-*`), and
the helper validates every finding (rule id, file, line range) before rendering the report.
Secret values are never written to the scan or the report. Working files go to `.review-repo/`;
add it and `repo-review.md` to the reviewed repo's `.gitignore`.

On a large repository only the priority files (40 by default) are read in full; the report's
**Coverage** section lists what was and was not read. Pass a sub-folder for a deeper pass.

## Using the skills in other repositories

Each skill folder is self-contained (Node >= 18, no dependencies). Copy it:

- one repository, Claude Code: `.claude/skills/<skill>/` → `<repo>/.claude/skills/<skill>/`
- every repository on your machine, Claude Code: → `~/.claude/skills/<skill>/`
- Junie: `.junie/skills/<skill>/` → `<repo>/.junie/skills/<skill>/`

The review skills skip their own folders when scanning a repository.

## Layout

- `.claude/skills/review-diff/` — `SKILL.md` (steps), `bin/review.mjs` (helper CLI: `parse`, `lines`, `validate`, `render`), `lib/`, `rules/`
- `.claude/skills/review-repo/` — `SKILL.md`, `bin/review-repo.mjs` (helper CLI: `scan`, `validate`, `render`), `lib/`, `rules/repo.md`
- `rules/*.md` — rule files (general, C#, Go, Java, JS, TS, React, repository); edit them to change what gets flagged
- `.junie/skills/` — generated copy for Junie, do not edit
- `scripts/sync-skills.mjs` — keeps the copies in sync
- `test/` — tests (`node:test`, no dependencies)

## Development

`.claude/skills/` is the single source of truth:

- edit skills only under `.claude/skills/`;
- edit shared files (`rules/*` except `repo.md`, `lib/errors.mjs`, `lib/languages.mjs`, `lib/rules.mjs`) only in `review-diff` — `review-repo` gets a copy;
- after a change run `npm run sync`, then `npm test` (Node >= 22 for the test runner).

`npm run sync:check` (also part of `npm test`) fails when a copy is out of date. The tests also
lint the rule files: heading format, unique ids, prefixes, severity/status values and the
`look-for` / `why` / `fix` fields.
