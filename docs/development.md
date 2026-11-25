# Development

How this repository is organized and how to change it safely. The same rules are in
[AGENTS.md](../AGENTS.md) for AI agents working on the repository.

## Layout

```
.claude/skills/              ← SOURCE OF TRUTH (edit here)
  review-diff/
    SKILL.md                 steps the agent follows
    bin/review.mjs           helper CLI: parse, lines, validate, render
    lib/                     diff parsing, findings validation, rendering, rules, languages
    rules/                   rule files + languages.json (shared with review-repo)
  review-repo/
    SKILL.md
    bin/review-repo.mjs      helper CLI: scan, validate, render
    lib/scan.mjs             inventory and signals
    lib/repo-findings.mjs    findings validation
    lib/repo-render.mjs      report rendering
    lib/{errors,languages,rules}.mjs   ← copied from review-diff
    rules/repo.md            REPO-* rules (own)
    rules/*                  ← copied from review-diff
.agents/skills/              ← generated mirror (Codex, Copilot, Gemini CLI, Cursor)
.junie/skills/               ← generated mirror (Junie)
scripts/
  sync-skills.mjs            regenerates mirrors and shared copies; --check reports drift
  install-skills.mjs         installs skills into another repository or ~/
test/                        node:test suites
docs/                        documentation
AGENTS.md, CLAUDE.md         instructions for agents working on this repository
```

## Single source of truth

The skills exist in several places, because every agent reads its own folder and every skill
folder must be self-contained. Only one place is edited:

| Change | Edit | Then |
|-|-|-|
| A skill's steps, helper or own files | `.claude/skills/<skill>/` | `npm run sync` |
| Shared rules or shared libs | `.claude/skills/review-diff/` | `npm run sync` |
| REPO rules | `.claude/skills/review-repo/rules/repo.md` | `npm run sync` |

`npm run sync` does two things:

- it copies the shared paths listed in `SHARED` in `scripts/sync-skills.mjs` from
  `review-diff` to `review-repo`;
- it mirrors every `.claude/skills/<skill>/` exactly into `.agents/skills/` and
  `.junie/skills/`.

`npm test` includes `sync --check` and fails when anything is out of date, so a forgotten sync
cannot be committed unnoticed.

## Tests

```bash
npm test        # Node.js >= 22 for the test runner; the skills themselves need >= 18
```

| Suite | Covers |
|-|-|
| `test/review-diff/*` | diff parsing (including quoted non-ASCII paths), globs, findings validation, rendering, CLI end-to-end |
| `test/review-repo/*` | scanner (inventory, signals, secret redaction, scope), findings validation, report, CLI end-to-end |
| `test/rules.test.mjs` | lints all rule files |
| `test/skills.test.mjs` | `SKILL.md` portability (name, description, `$ARGUMENTS` note, imports) |
| `test/sync.test.mjs` | sync behaviour and that the repository is in sync |
| `test/install.test.mjs` | install script |

Fixtures that look like secrets are built at runtime (`['AKIA', '…'].join('')`), so no
secret-like string is committed.

## Changing a skill

1. Edit under `.claude/skills/<skill>/`.
2. If you change the helper's input or output (CLI flags, JSON fields, exit codes), update
   `SKILL.md` in the same change. The agent only knows what `SKILL.md` tells it.
3. Add or adjust tests.
4. `npm run sync`, then `npm test`.
5. Try it for real: run the skill in an agent on a small diff or repository and read the
   report.

## Adding a new skill

1. Create `.claude/skills/<name>/SKILL.md` following
   [the portability rules](agents.md#rules-for-portable-skills), plus `bin/` and `lib/` as
   needed.
2. If it needs shared files from `review-diff`, add an entry to `SHARED` in
   `scripts/sync-skills.mjs`.
3. Add tests under `test/<name>/`. `test/skills.test.mjs` picks up the new `SKILL.md`
   automatically.
4. `npm run sync`, `npm test`, and document it in `docs/` and the README.

## Releasing to other repositories

There is no package. Teams install with `scripts/install-skills.mjs` (see
[agents.md](agents.md#installing)) and re-run it to update. Mention rule changes in the commit
message, because they change review results.

## Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/): `feat(review-repo): …`,
`fix(review-diff): …`, `docs: …`, `test: …`, `chore: …`. Do not commit review outputs
(`review.md`, `repo-review.md`, `.review-comment/`, `.review-repo/`); they are in `.gitignore`.
