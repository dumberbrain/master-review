# Overview

`master-review` is a small toolkit of AI-agent skills for code review. It gives a coding agent
a fixed procedure, a shared set of review rules and a helper program. As a result, reviews are
consistent, every comment points to a real line and cites a named rule, and the result is a
Markdown file you can read, edit and share.

## What it is for

| Situation | Skill | You get |
|-|-|-|
| A pull request / merge request needs review, and you want draft comments to paste into GitHub or GitLab | [`review-diff`](review-diff.md) | `review.md`: one ready-to-paste comment per finding, with the exact line to click, severity, rule and (where possible) a one-click suggestion |
| The same, but the project is on your disk and the change touches shared code | [`review-change`](review-change.md) | `review.md` like review-diff; the agent also checks callers, tests and conventions in the rest of the project |
| You join a project, take over a service, or want a health check of a codebase (this repository or another one by path) | [`review-repo`](review-repo.md) | `repo-review.md`: project overview, repository-level problems (secrets, tests, CI, dependencies, structure), prioritized file/line findings, and what was and was not covered |

All skills are **read-only** towards the reviewed code. They never post comments, approve,
commit or push. A person decides what to do with the report.

## How it works

```
             ┌────────────── agent (Claude Code, Codex, Copilot, …) ───────────────┐
 diff / repo │ 1. run helper  →  2. read rules + code  →  3. write findings.json     │
 ───────────►│                                                                      │
             │ 4. run helper validate  ── invalid? fix and repeat ──►  5. render     │
             └───────────────────────────────────────────────────────────────────────┘
                        │                                              │
                 bin/*.mjs (Node.js, no dependencies)          review.md / repo-review.md
```

Work is split on purpose:

- **The agent** does what needs judgement. It understands the code, decides whether something
  is a problem, picks the matching rule and writes the comment.
- **The helper** (`bin/*.mjs`) does what must be exact:
  - parses the diff or scans the repository;
  - lists the lines that can carry a comment;
  - rejects findings with unknown rules, rules for the wrong language, or line numbers outside
    the diff or file;
  - renders the report.

Agents are good at the first part and unreliable at the second, especially with line numbers.
The validation step catches those errors before they reach the report.

## Rules

Findings must cite a rule from `rules/`. A finding without a matching rule is not reported.
This keeps reviews focused and explainable: each comment carries the rule's *why* and *fix*.

| File | Prefix | Applies to |
|-|-|-|
| `general.md` | `GEN` | every file |
| `csharp.md` | `CS` | `.cs` |
| `go.md` | `GO` | `.go` |
| `java.md` | `JAVA` | `.java` |
| `javascript.md` | `JS` | `.js .mjs .cjs .jsx` |
| `typescript.md` | `TS` | `.ts .mts .cts .tsx` |
| `react.md` | `REACT` | `.jsx .tsx` |
| `repo.md` (review-repo only) | `REPO` | repository-level problems, any file |

The rule files are plain Markdown and meant to be edited by your team. See [rules.md](rules.md).

Severities, from most to least serious:

| Severity | Meaning |
|-|-|
| `blocker` | must be fixed before merge / immediately (e.g. a committed secret) |
| `major` | a real bug or risk that should be fixed in this change |
| `minor` | a maintainability problem worth fixing soon |
| `suggestion` | optional improvement |

## Supported agents

The skills follow the open [Agent Skills](https://agentskills.io/specification) format. They
are shipped for Claude Code (`.claude/skills/`), for OpenAI Codex, GitHub Copilot, Gemini CLI
and Cursor (`.agents/skills/`), and for JetBrains Junie (`.junie/skills/`). See
[agents.md](agents.md).

## Requirements

- An agent that supports Agent Skills and can run shell commands.
- Node.js >= 18 on the machine where the agent runs. The helpers have no dependencies.

## Limitations

- **The agent's judgement varies.** Two runs can produce different findings. The validation
  step only guarantees that findings are well-formed and correctly anchored, not that they are
  right. Read the report critically.
- **review-diff sees only the diff.** It does not see the rest of the file, so it can miss
  context or raise a false positive about code outside the hunk. Use review-change when the
  project is available.
- **review-change is only as good as the checkout.** If the project folder is not on the PR
  branch, the agent has to apply the patch in its head. The skill reports this as
  `checkout: base`.
- **review-repo reads a sample.** On large repositories it reads the priority files (40 by
  default) in full and relies on scan signals for the rest. The report's Coverage section
  lists what was read.
- **Rules cover C#, Go, Java, JavaScript, TypeScript and React.** Other languages get the
  general rules only.
