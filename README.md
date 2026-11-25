# master-review

**English** | [Azərbaycanca](README.az.md)

Code-review skills for AI coding agents. Give your agent a pull request diff or a whole
repository; get back a Markdown report with findings anchored to real lines, each citing a
named rule with its reason and fix. The skills only write reports. They never post, commit,
push or change the reviewed code.

| Skill | Reviews | Writes |
|-|-|-|
| **review-diff** | a GitHub PR / GitLab MR diff (pasted or a `.diff` file) | `review.md`: copy-paste comments with the line to click, severity, rule and suggested code |
| **review-change** | a PR / MR diff **plus the project folder** it belongs to | `review.md`, like review-diff, but the agent also checks callers, tests and conventions in the rest of the project |
| **review-repo** | a whole repository or one sub-folder: this one or another one by path | `repo-review.md`: overview, repository-level problems (secrets, tests, CI, lockfiles, structure), prioritized findings, coverage |

Works with **Claude Code, OpenAI Codex, GitHub Copilot, Gemini CLI, Cursor and JetBrains Junie**
(open [Agent Skills](https://agentskills.io/specification) format). Needs Node.js >= 18.

## Quick start

**1. Install into the repository you want to review**

```bash
git clone https://github.com/dumberbrain/master-review.git
node master-review/scripts/install-skills.mjs --target path/to/your-repo
```

This installs all skills for Claude Code (`.claude/skills/`) and for Codex, Copilot, Gemini
CLI and Cursor (`.agents/skills/`). Other options:

- `--agents claude`, `--agents agents` or `--agents claude,junie` for specific agents;
- `--user` installs for all your repositories at once.

See [docs/agents.md](docs/agents.md#installing).

Add the outputs to the reviewed repository's `.gitignore`:

```gitignore
.review-comment/
review.md
.review-repo/
repo-review.md
repo-review-*.md
.review-change/
```

**2. Review a pull request**

```bash
gh pr diff 42 > pr-42.diff          # or open https://github.com/<owner>/<repo>/pull/42.diff
```

In Claude Code: `/review-diff pr-42.diff`. In other agents: *"Review pr-42.diff with the
review-diff skill"*. Open `review.md` and paste the comments you agree with into the PR.

If the project is on your disk, give its folder too, so the agent can check callers and tests
outside the diff: `/review-change pr-42.diff ../shop-api`. See
[docs/review-change.md](docs/review-change.md).

**3. Review a whole repository**

In Claude Code: `/review-repo`, or `/review-repo src/api` for one folder. To review another
repository and keep the report here: `/review-repo ../shop-api`, which writes
`repo-review-shop-api.md`. In other agents: *"Run the review-repo skill on this repository"*
or *"…on `../shop-api`"*. Open the report.

## Documentation

| Document | Read it for |
|-|-|
| [docs/overview.md](docs/overview.md) | purpose, how it works, rules and severities, limitations |
| [docs/review-diff.md](docs/review-diff.md) | getting diffs, running, reading `review.md`, pasting into GitHub/GitLab, CLI reference, troubleshooting |
| [docs/review-change.md](docs/review-change.md) | reviewing a diff with its project, head vs base checkout, context helper, troubleshooting |
| [docs/review-repo.md](docs/review-repo.md) | what is scanned, which files are read, reading `repo-review.md`, secrets, large repos, CLI reference, troubleshooting |
| [docs/agents.md](docs/agents.md) | supported agents and their folders, installing, running in each agent, **rules for portable skills** |
| [docs/rules.md](docs/rules.md) | rule packs per resource; `review.config.json` (packs on/off, your own pack, rule overrides); rule file format; adding rules, packs and languages |
| [docs/development.md](docs/development.md) | repository layout, the single-source rule, tests, changing or adding a skill |
| [AGENTS.md](AGENTS.md) | instructions for AI agents working on this repository |

## How it works

The agent does the judgement: it reads the code and the rules and writes findings as JSON.
A small Node.js helper in each skill does everything that must be exact:

- parsing the diff or scanning the repository;
- listing the lines that can carry a comment;
- rejecting findings with unknown rules, rules for the wrong language, or impossible line
  numbers;
- rendering the report.

Details: [docs/overview.md](docs/overview.md#how-it-works).

## Rules

Rules are Markdown files grouped into **packs**, one per resource: Refactoring.Guru, OWASP,
.NET practices, Go Code Review Comments, patterns.dev, Bulletproof React, the React docs, and
repository-level rules (`REPO`, review-repo only). Rule ids keep their language prefixes:
`GEN`, `CS`, `GO`, `JAVA`, `JS`, `TS`, `REACT`.

A `review.config.json` in your repository turns packs on or off, adds your team's own
guidelines as a pack, and changes the severity of single rules or retires them, without
editing the skills:

```json
{
  "packs": {
    "patterns-dev": { "enabled": false },
    "acme": { "title": "ACME guidelines", "dir": "review-rules/acme" }
  },
  "rules": { "GEN-006": { "status": "retired" }, "CS-004": { "severity": "blocker" } }
}
```

Every finding cites exactly one rule. See [docs/rules.md](docs/rules.md).

## Developing this repository

```bash
npm run sync    # after editing anything under .claude/skills/
npm test        # Node.js >= 22 for the test runner
```

Edit skills only under `.claude/skills/`. `.agents/skills/` and `.junie/skills/` are generated.
See [docs/development.md](docs/development.md).
