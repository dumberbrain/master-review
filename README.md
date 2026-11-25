# master-review

Code-review skills for AI coding agents. Give your agent a pull request diff or a whole
repository; get back a Markdown report with findings anchored to real lines, each citing a
named rule with its reason and fix. The skills only write reports. They never post, commit,
push or change the reviewed code.

| Skill | Reviews | Writes |
|-|-|-|
| **review-diff** | a GitHub PR / GitLab MR diff (pasted or a `.diff` file) | `review.md`: copy-paste comments with the line to click, severity, rule and suggested code |
| **review-repo** | a whole repository or one sub-folder | `repo-review.md`: overview, repository-level problems (secrets, tests, CI, lockfiles, structure), prioritized findings, coverage |

Works with **Claude Code, OpenAI Codex, GitHub Copilot, Gemini CLI, Cursor and JetBrains Junie**
(open [Agent Skills](https://agentskills.io/specification) format). Needs Node.js >= 18.

## Quick start

**1. Install into the repository you want to review**

```bash
git clone https://github.com/dumberbrain/master-review.git
node master-review/scripts/install-skills.mjs --target path/to/your-repo
```

This installs both skills for Claude Code (`.claude/skills/`) and for Codex, Copilot, Gemini
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
```

**2. Review a pull request**

```bash
gh pr diff 42 > pr-42.diff          # or open https://github.com/<owner>/<repo>/pull/42.diff
```

In Claude Code: `/review-diff pr-42.diff`. In other agents: *"Review pr-42.diff with the
review-diff skill"*. Open `review.md` and paste the comments you agree with into the PR.

**3. Review the whole repository**

In Claude Code: `/review-repo`, or `/review-repo src/api` for one folder. In other agents:
*"Run the review-repo skill on this repository"*. Open `repo-review.md`.

## Documentation

| Document | Read it for |
|-|-|
| [docs/overview.md](docs/overview.md) | purpose, how it works, rules and severities, limitations |
| [docs/review-diff.md](docs/review-diff.md) | getting diffs, running, reading `review.md`, pasting into GitHub/GitLab, CLI reference, troubleshooting |
| [docs/review-repo.md](docs/review-repo.md) | what is scanned, which files are read, reading `repo-review.md`, secrets, large repos, CLI reference, troubleshooting |
| [docs/agents.md](docs/agents.md) | supported agents and their folders, installing, running in each agent, **rules for portable skills** |
| [docs/rules.md](docs/rules.md) | rule file format; editing, adding and retiring rules; adding a language; skipping files |
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

Rules are Markdown files that your team can edit:

- general rules (`GEN`);
- C# (`CS`), Go (`GO`), Java (`JAVA`), JavaScript (`JS`), TypeScript (`TS`), React (`REACT`);
- repository-level rules (`REPO`).

Every finding cites exactly one rule. See [docs/rules.md](docs/rules.md).

## Developing this repository

```bash
npm run sync    # after editing anything under .claude/skills/
npm test        # Node.js >= 22 for the test runner
```

Edit skills only under `.claude/skills/`. `.agents/skills/` and `.junie/skills/` are generated.
See [docs/development.md](docs/development.md).
