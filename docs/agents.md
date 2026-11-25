# Using the skills with other agents

The skills were built in Claude Code, but they are plain
[Agent Skills](https://agentskills.io/specification): a folder with a `SKILL.md` file plus
scripts. Any agent that supports Agent Skills and can run shell commands can use them.

- [Supported agents](#supported-agents)
- [Installing](#installing)
- [Running a skill](#running-a-skill)
- [What an agent needs](#what-an-agent-needs)
- [Rules for portable skills](#rules-for-portable-skills)
- [Adding support for another agent](#adding-support-for-another-agent)

## Supported agents

Every agent discovers skills in its own folders. This repository ships the same skills in
three folders, generated from `.claude/skills/` by `npm run sync`:

| Folder in this repo | Read by |
|-|-|
| `.claude/skills/` | Claude Code (also GitHub Copilot and Cursor, for compatibility) |
| `.agents/skills/` | OpenAI Codex, GitHub Copilot, Gemini CLI, Cursor (the cross-agent convention) |
| `.junie/skills/` | JetBrains Junie |

Per agent, from each vendor's documentation (checked November 2026):

| Agent | Project-level folders | User-level folders | How to run a skill |
|-|-|-|-|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | `/review-diff`, `/review-change`, `/review-repo`, or ask ("review this diff") |
| OpenAI Codex | `.agents/skills/` (from the working directory up to the repo root) | `~/.agents/skills/` | `$review-diff` / `$review-change` / `$review-repo`, the `/skills` picker, or ask |
| GitHub Copilot (VS Code / JetBrains / Visual Studio agent mode, Copilot CLI, cloud agent) | `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.copilot/skills/`, `~/.agents/skills/` | ask; Copilot picks the skill from its description |
| Gemini CLI | `.gemini/skills/`, `.agents/skills/` | `~/.gemini/skills/`, `~/.agents/skills/` | ask; Gemini activates the skill after you confirm the prompt |
| Cursor | `.agents/skills/`, `.cursor/skills/` (also `.claude/skills/`, `.codex/skills/`) | `~/.agents/skills/`, `~/.cursor/skills/` (also `~/.claude/skills/`, `~/.codex/skills/`) | type `/` in Agent chat and pick the skill, or ask |
| JetBrains Junie | `.junie/skills/` | — | ask |

Notes:

- The Junie folder follows this repository's existing setup; JetBrains' documentation could not
  be checked when this page was written. Verify it in your Junie version.
- The Gemini CLI documentation says Gemini CLI was replaced by Antigravity CLI in June 2026.
  Check the Antigravity documentation for its skill folders.
- Copilot and Cursor read both `.claude/skills/` and `.agents/skills/`. A repository that has
  the skills in both folders may show them twice in those tools; the copies are identical.
  Install only into the folders your team needs (see below).
- Only Claude Code uses the `argument-hint` and `$ARGUMENTS` features. The other agents get
  the arguments from your message; the skills are written to handle both.

## Installing

Use the install script from this repository. It copies each skill folder exactly. A re-run
updates the copy and removes files that no longer exist. Other skills in the target folder
are not touched.

```bash
# into another repository, for Claude Code and the .agents/ agents (the default)
node scripts/install-skills.mjs --target ../my-service

# only for Codex / Copilot / Gemini CLI / Cursor
node scripts/install-skills.mjs --target ../my-service --agents agents

# Claude Code + Junie, only the diff skill
node scripts/install-skills.mjs --target ../my-service --agents claude,junie --skills review-diff

# for every repository on this machine (user level: ~/.claude/skills, ~/.agents/skills)
node scripts/install-skills.mjs --user

# show what would change without writing anything
node scripts/install-skills.mjs --target ../my-service --dry-run
```

`--agents` takes `claude`, `agents` and `junie`. `codex`, `copilot`, `gemini` and `cursor` are
aliases for `agents`. Junie has no user-level folder here, so install it per repository.

After installing into a repository, the script lists the report files that the target's
`.gitignore` does not ignore yet. Add them there yourself:

```gitignore
.review-comment/
review.md
.review-repo/
repo-review.md
.review-change/
repo-review-*.md
```

Which folders to install:

| Team uses | `--agents` |
|-|-|
| Claude Code only | `claude` |
| Codex, Copilot, Gemini CLI or Cursor only | `agents` |
| Claude Code and one of the others | `claude,agents` (Copilot/Cursor may list the skills twice) |
| Junie | add `junie` |

You can also copy the folders by hand, e.g. `.agents/skills/review-repo/` →
`<repo>/.agents/skills/review-repo/`. Always copy the whole folder.

## Running a skill

The skills do not depend on the agent's slash commands. In any agent you can say:

- "Review this diff with the review-diff skill" and paste the diff, or name a file:
  "use review-diff on `changes.diff`, write `pr-42.md`".
- "Review `pr-42.diff` with the review-change skill; the project is in `../shop-api`".
- "Run the review-repo skill on this repository", or "…on `src/api`, output `api-review.md`",
  or "…on the repository in `../shop-api`".

The agent loads `SKILL.md` and follows its steps. It runs the helper with `node`, reads the
files, writes the findings JSON, validates it with the helper and renders the report.

## What an agent needs

| Capability | Why |
|-|-|
| Agent Skills support (reads `SKILL.md`) | to find and load the skill |
| Shell commands, at least `node` | the helper CLIs in `bin/` |
| Read files in the repository | patches, source files, rule files |
| Write files in the working directory | `.review-comment/`, `.review-change/`, `.review-repo/` and the report |
| Read files outside the working directory (review-change, and review-repo on another repository) | the reviewed project; the agent may ask you to allow access to that folder |
| Node.js >= 18 on the machine | the helpers use only `node:` built-ins |

An agent mode that cannot run commands, such as a pure chat panel, cannot run these skills.
If an agent asks for approval of each command, approve the `node "<skill>/bin/…"` calls. They
only read the repository and write the work folder and the report.

## Rules for portable skills

These rules apply to every skill in this repository and to any skill added later. They keep
one `SKILL.md` working in all agents listed above.

1. **Standard frontmatter first.** `name` and `description` are required by every agent.
   - `name`: lowercase letters, digits and hyphens. It must equal the folder name and be at
     most 64 characters.
   - `description`: at most 1024 characters. Say what the skill does *and* when to use it.
     Several agents pick a skill from its description alone.
2. **Agent-specific fields are optional extras.** `allowed-tools` and `argument-hint` are
   honored by some agents and ignored by others. The skill must work correctly without them.
3. **No `$ARGUMENTS`-only logic.** Describe the arguments in prose. Say that in Claude Code they
   come from `$ARGUMENTS` and in other agents from the user's message.
4. **Paths relative to the skill folder.** Refer to `SKILL_ROOT`, the folder that holds
   `SKILL.md`. Never hard-code `.claude/skills/…`. The same file is installed under
   `.agents/skills/`, `.junie/skills/` and home folders.
5. **Determinism in the helper, judgement in the agent.** Parsing, line numbers, validation and
   rendering belong in `bin/` + `lib/` (Node.js >= 18, no dependencies). The agent reviews and
   writes JSON, and the helper checks it. This also makes results consistent across agents.
6. **Self-contained folder.** No imports or file reads outside the skill folder. Shared code is
   copied in by `scripts/sync-skills.mjs`.
7. **Only generic tools.** Steps may use: read a file, write a file, search, and run a shell
   command. Do not rely on agent-specific tools such as subagents, MCP servers or IDE APIs.
8. **Read-only towards the reviewed code.** Write only the skill's work folder and the report.
   Never post, commit or push.
9. **Short `SKILL.md`.** Keep it under about 500 lines. Long reference material goes into
   `rules/` or other files that the steps tell the agent to read.
10. **Machine-readable helper output.** JSON on stdout, errors on stderr, exit code 0 or 1. The
    agent decides what to do next from these, the same way in every agent.

`test/rules.test.mjs` and the helper tests run in CI-like fashion with `npm test`. When you add
a skill, also add a test that its `SKILL.md` `name` matches its folder.

## Adding support for another agent

1. Find the agent's project-level skills folder in its documentation. If it reads
   `.agents/skills/`, nothing is needed.
2. Otherwise, add the folder to `MIRRORS` in `scripts/sync-skills.mjs`. Add it to `TARGETS`
   (and `ALIASES` if useful) in `scripts/install-skills.mjs`.
3. Run `npm run sync` and `npm test`, then add a row to the tables above.
