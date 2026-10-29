# master-review

Claude Code project skill `review-diff`: paste a GitHub PR or GitLab MR diff into chat and get `review.md` with copy-paste review comments (file, line, severity, rule, suggested code). Nothing is posted.

## Usage

1. Get the diff:
   - GitHub: `https://github.com/<owner>/<repo>/pull/<n>.diff`
   - GitLab: `https://<host>/<group>/<project>/-/merge_requests/<n>.diff`
   - Local: `git diff main...HEAD`
2. In Claude Code (opened in this folder): `/review-diff` and paste the diff (say "GitLab" for MR diffs), or `/review-diff path/to/file.diff [output.md]`.
3. Open `review.md`.

## Layout

- `.claude/skills/review-diff/SKILL.md` — review steps
- `.claude/skills/review-diff/bin/review.mjs` — helper CLI: `parse`, `lines`, `validate`, `render` (Node >= 18, no dependencies)
- `.claude/skills/review-diff/rules/` — rule files (general, C#, Go, Java, JS, TS, React); edit them to change what gets flagged

Working files go to `.review-comment/` (git-ignored).
