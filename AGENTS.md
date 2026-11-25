# AGENTS.md

Instructions for any AI coding agent (Claude Code, Codex, Copilot, Gemini CLI, Cursor, Junie, …)
working **on** this repository. For how to **use** the skills, see [README.md](README.md) and
[docs/](docs/).

## What this repository is

Three portable [Agent Skills](https://agentskills.io/specification) for code review:

- `review-diff` — reviews a pasted GitHub PR / GitLab MR diff and writes `review.md` with
  copy-paste comments.
- `review-change` — reviews a diff together with the project folder it belongs to (callers,
  tests, conventions) and writes `review.md`. It shares the `review-diff` helper and adds
  `bin/context.mjs`.
- `review-repo` — reviews a whole repository (this one or another one by path) and writes
  `repo-review.md`.

Each skill is a folder with `SKILL.md` (instructions for the agent), `bin/` (a Node.js helper
CLI), `lib/` (its modules) and `rules/` (the review rules). The agent does the judgement; the
helper does everything deterministic (parsing, line anchoring, validation, rendering).

## Where to edit — the single-source rule

- **Edit skills only under `.claude/skills/`.** `.agents/skills/` and `.junie/skills/` are
  generated mirrors; never edit them by hand.
- **Edit shared files only in `review-diff`:** `rules/config.json` and `rules/packs/*` (except
  `review-repo/rules/packs/repo/`),
  `lib/errors.mjs`, `lib/languages.mjs`, `lib/rules.mjs`. `review-repo` receives a copy.
  `review-change` receives `bin/review.mjs`, `rules/*` and every `lib/*.mjs` except its own
  `lib/project.mjs` (the full list is `SHARED` in `scripts/sync-skills.mjs`).
- After any change under `.claude/skills/`, run `npm run sync`, then `npm test`.
  `npm test` fails if a mirror or copy is out of date.

## Commands

| Command | What it does |
|-|-|
| `npm test` | all tests (`node:test`, Node >= 22 for the test runner) |
| `npm run sync` | regenerate `.agents/skills/`, `.junie/skills/` and the shared copies |
| `npm run sync:check` | report drift without writing |
| `node scripts/install-skills.mjs --target <repo> [--agents claude,agents,junie]` | install the skills into another repository |

## Code rules

- Skill runtime code (`bin/`, `lib/`) must run on **Node.js >= 18 with no dependencies**:
  only `node:` built-ins, ES modules (`.mjs`). No `package.json` inside a skill folder.
- A skill folder must be **self-contained**: no imports from outside its own folder. Code that
  two skills need lives in `review-diff` and is copied by `scripts/sync-skills.mjs` (add new
  shared paths to `SHARED` there).
- Helper CLIs print JSON to stdout, errors to stderr, and use exit code 0 (ok) / 1 (invalid
  input). Keep that contract; `SKILL.md` relies on it.
- Every change to a helper needs a test under `test/`. Fixtures that look like secrets must be
  assembled at runtime (see `test/review-repo/fixture.mjs`), never written literally.
- Rules are grouped into packs (one folder per resource under `rules/packs/`, registered in
  `rules/config.json`). Rule files follow the format in [docs/rules.md](docs/rules.md);
  `test/rules.test.mjs` lints them. Never renumber rule ids.

## SKILL.md rules (portability)

Skills must work in every supported agent. Follow [docs/agents.md](docs/agents.md#rules-for-portable-skills):
`name` equals the folder name, paths are relative to the skill's own folder (never hard-code
`.claude/skills`), arguments are described in prose (`$ARGUMENTS` is Claude-only), and the
agent only needs to read/write files and run `node`.

## Safety

The skills are read-only for the reviewed code: they write only their work folder
(`.review-comment/`, `.review-change/`, `.review-repo/`) and the report, in the current working
directory, even when the reviewed project is elsewhere. Keep it that way — no posting, commenting,
committing or pushing from a skill. Never write secret values into scans, findings or reports.

## Commits

Conventional Commits (`feat(review-repo): …`, `fix(review-diff): …`, `docs: …`, `test: …`).
Do not commit review outputs (`review.md`, `repo-review*.md`, `.review-comment/`,
`.review-change/`, `.review-repo/`).
