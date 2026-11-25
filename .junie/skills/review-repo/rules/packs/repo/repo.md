---
language: general
prefix: REPO
version: 1.0.0
---

# Repository-Level Review Rules

Rules about the repository as a whole: how it is built, tested, configured and kept safe.
They apply to any file and to repository-wide (`"general": true`) findings. Most of them start
from a scan signal (`signals.*` in `scan.json`); a signal is only a lead, so read the files and
confirm the problem before reporting it.

Prefer a language rule or `GEN-*` rule for a problem inside one piece of code; use `REPO-*`
for problems about files, structure, dependencies and tooling.

### REPO-001 — Secret or credential file committed

- **severity**: blocker
- **status**: active
- **applies-to**: `.env` files, keys and keystores, config files, CI files
- **look-for**: `signals.sensitiveFiles` and `signals.secretCandidates` that turn out to be real: `.env` with real values, private keys, keystores, tokens or passwords in config/CI files. Not: `.env.example`, obvious placeholders, test fixtures with fake values. Use GEN-009 instead for a secret hard-coded in source code
- **why**: everything in git is readable by anyone with clone access and stays in the history after the file is deleted
- **fix**: rotate/revoke the credential first; remove the file, add it to `.gitignore`, load the value from the environment or a secret store; purge the history if the repo is shared widely. Never repeat the secret value in the review
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html, https://12factor.net/config

```text
bad:  .env (committed)            DB_PASSWORD=<real value>
good: .env.example (committed)    DB_PASSWORD=
      .gitignore                  .env
```

### REPO-002 — Production code without automated tests

- **severity**: major
- **status**: active
- **applies-to**: the repository, core modules
- **look-for**: `signals.tests.testFiles` is 0 or tiny compared with `codeFiles`; core business logic (services, domain, handlers) with no tests at all; no test script or test target in the manifest
- **why**: without tests every change is verified by hand or in production, and refactoring becomes too risky to attempt
- **fix**: add a test runner and a `test` script; start with unit tests for the most important and most changed modules, then wire them into CI
- **sources**: https://martinfowler.com/articles/practical-test-pyramid.html

### REPO-003 — No continuous integration

- **severity**: minor
- **status**: active
- **applies-to**: the repository
- **look-for**: `signals.ci` is empty, or the CI configuration only deploys and never builds, lints or runs the tests
- **why**: broken builds and failing tests reach the main branch unnoticed and are found later, when they are harder to fix
- **fix**: add a pipeline that runs on every push/merge request: install with the lockfile, build, lint, test
- **sources**: https://martinfowler.com/articles/continuousIntegration.html

### REPO-004 — Missing or outdated README

- **severity**: minor
- **status**: active
- **applies-to**: README, docs
- **look-for**: no README; a README that does not say what the project is and how to install, run, test and configure it; documented commands, paths or scripts that no longer exist in the repo
- **why**: new team members and reviewers lose time reverse-engineering the setup, and wrong docs are worse than none
- **fix**: describe purpose, prerequisites, setup, run/test commands and configuration; fix or remove outdated sections
- **sources**: https://www.makeareadme.com/

### REPO-005 — Dependencies not locked or pinned

- **severity**: major
- **status**: active
- **applies-to**: manifests, lockfiles, Dockerfiles, CI files
- **look-for**: an application manifest in `signals.missingLockfiles`; runtime dependencies on `*`, `latest` or open ranges; Docker base images on `latest` or without a tag. A published library may omit its lockfile on purpose: say so if unsure
- **why**: two builds of the same commit can install different code, so a new upstream release can break or compromise production with no change in the repo
- **fix**: commit the lockfile and install from it (`npm ci`, `go mod download`, `pip install -r` with pinned versions); pin image tags or digests
- **sources**: https://12factor.net/dependencies, https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json

### REPO-006 — Build output or large binaries committed

- **severity**: minor
- **status**: active
- **applies-to**: tracked files
- **look-for**: `signals.buildArtifacts` (dist/, build/, obj/, bin/Debug, source maps, node_modules) or `signals.largeBinaries` tracked in git
- **why**: generated files go stale, cause merge conflicts and bloat every clone; binaries cannot be reviewed
- **fix**: `git rm --cached` them, add the folders to `.gitignore`, publish artifacts from CI; use Git LFS for binaries that must be versioned
- **sources**: https://github.com/github/gitignore, https://git-lfs.com/

### REPO-007 — .gitignore missing or incomplete

- **severity**: suggestion
- **status**: active
- **applies-to**: `.gitignore`
- **look-for**: no `.gitignore` (`signals.gitignore` false), or local/output files (IDE folders, logs, `.env`, build folders) that are tracked or not ignored
- **why**: local and generated files end up in commits and pull requests, including files with secrets
- **fix**: start from the matching template for the stack and add project-specific entries
- **sources**: https://github.com/github/gitignore

### REPO-008 — Hotspot: large file that changes constantly

- **severity**: minor
- **status**: active
- **applies-to**: files in both `signals.hotspots` and `signals.largeFiles`
- **look-for**: a file with hundreds of lines that is also among the most changed files, and that mixes several responsibilities
- **why**: bugs and merge conflicts concentrate where complexity and change meet; improving these files pays off the most
- **fix**: add tests around the file first, then split it by responsibility into smaller modules
- **sources**: https://refactoring.guru/smells/large-class, https://refactoring.guru/smells/divergent-change

### REPO-009 — TODO/FIXME debt piling up

- **severity**: suggestion
- **status**: active
- **applies-to**: source files
- **look-for**: many TODO/FIXME/HACK markers in core code (`signals.todos`), especially ones that describe known bugs, missing validation or security gaps, without a ticket reference
- **why**: untracked TODOs are invisible in planning; the ones that describe bugs stay bugs
- **fix**: fix the ones describing real defects; turn the rest into tracked issues and reference the issue id in the comment
- **sources**: https://refactoring.guru/smells/comments

### REPO-010 — Layering or dependency direction violated

- **severity**: major
- **status**: active
- **applies-to**: modules, packages, imports
- **look-for**: UI components or controllers querying the database directly; domain code importing framework, HTTP or ORM types; circular imports between modules or packages; one feature reaching into another feature's internals
- **why**: changes ripple across layers, code cannot be tested in isolation, and the architecture erodes with each shortcut
- **fix**: route through the intended layer (service, repository, public module API); invert the dependency with an interface; enforce boundaries with a lint/architecture test
- **sources**: https://martinfowler.com/bliki/PresentationDomainDataLayering.html

### REPO-011 — Environment-specific configuration hard-coded

- **severity**: major
- **status**: active
- **applies-to**: source files, config files
- **look-for**: hosts, URLs, ports, connection strings or feature switches for a specific environment written in source code; `if (env === 'prod')` branches instead of configuration
- **why**: every environment change needs a code change and a release, and test builds can accidentally talk to production
- **fix**: read the values from configuration/environment variables with one typed config module; keep per-environment values outside the code
- **sources**: https://12factor.net/config

### REPO-012 — Module or code copied across the repository

- **severity**: minor
- **status**: active
- **applies-to**: folders, modules, utility functions
- **look-for**: the same file or folder copied into several places (identical or nearly so), or the same utility re-implemented in several modules
- **why**: copies drift apart; a fix applied to one copy leaves the bug in the others
- **fix**: keep one source (shared module/package); if copies are required, generate them from the source and check in CI that they are in sync
- **sources**: https://refactoring.guru/smells/duplicate-code

### REPO-013 — Unused files, modules or dependencies

- **severity**: suggestion
- **status**: active
- **applies-to**: files, modules, manifests
- **look-for**: files nothing imports or references; old copies (`*_old`, `*.bak`, `v1/` duplicates); dependencies in the manifest that no code uses
- **why**: dead code misleads readers, slows builds and keeps vulnerable packages installed for nothing
- **fix**: delete it (git keeps the history); remove unused dependencies from the manifest
- **sources**: https://refactoring.guru/smells/dead-code

### REPO-014 — End-of-life runtime or framework

- **severity**: major
- **status**: active
- **applies-to**: manifests, Dockerfiles, CI files
- **look-for**: a runtime or framework version that you are certain is end-of-life (e.g. Node.js 14, .NET Core 3.1, Python 3.7). Skip it when you are not sure about the version's status
- **why**: end-of-life versions get no security fixes, and the upgrade gets harder the longer it waits
- **fix**: upgrade to a supported LTS version; pin it in the manifest, Dockerfile and CI in one place
- **sources**: https://endoflife.date/

### REPO-015 — No consistent error handling or logging at the boundaries

- **severity**: minor
- **status**: active
- **applies-to**: entrypoints, HTTP handlers, jobs, consumers
- **look-for**: entrypoints with no central error handler; a mix of `console.log`/`print` and a logger; stack traces or internal errors returned to clients
- **why**: failures in production are either invisible or leak internals, and every handler re-invents error handling
- **fix**: one error-handling middleware/handler per entrypoint type, one structured logger, safe error responses to clients
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
