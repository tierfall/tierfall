---
name: release-prep
description: Pre-flight before opening a develop → main release PR
---

Argument: `{{version}}` (e.g., `0.1.0`).

Run the following checks and report status for each. Stop at the first failure.

1. `pnpm exec changeset status` — verify at least one pending changeset exists.
2. `pnpm exec changeset version` — apply pending changesets; verify the bump matches `{{version}}`.
3. `pnpm publint` — verify package publishing config.
4. `pnpm attw` — verify type resolution in ESM and CJS.
5. `gh issue list --milestone "v{{version}} — *" --state open --label "prio:p0"` — report any open p0 issues.
6. Grep root README for "What works today" section; verify it lists the v{{version}} feature set.
7. `pnpm exec nx run-many --target=test --parallel=3` — all tests must pass.

If everything passes, open the release PR: `gh pr create --base main --head develop --title "release: v{{version}}"`.
