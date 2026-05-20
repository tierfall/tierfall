# TierFall Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Note: the user explicitly invokes `/execute-plan` as Phase 3 — execution does **not** start automatically when this file is written.

**Goal:** Stand up the TierFall monorepo, its toolchain enforcement, GitHub Project + branch protection, scaffolded packages, demo, docs, CI workflows, and v0.1 issue backlog — such that subsequent v0.1 feature work proceeds issue-by-issue against `develop`.

**Architecture:** Nx-managed TypeScript monorepo (`packages/*` + `apps/*`) on pnpm, with strict ESLint/TypeScript that forbid `any` and lint-suppression directives. The scaffolding PR includes failing TDD tests for adapter packages — they're meant to be red at scaffold-close, green after the per-adapter implementation issues.

**Tech Stack:** TypeScript 5.x · Node 24 LTS · pnpm 10.x · Nx 22.x · tsup · ESLint 10 flat config · Jest 29.x + ts-jest 29.x · Husky + lint-staged · Conventional Commits + commitlint · changesets · Fumadocs 16.x · Docker Compose · GitHub Actions

**Reading order for the executor:** Read §1–§3 first (frame and inventory). Then execute §4 sequentially. §5 is the v0.1 backlog — it gets created as GitHub issues during §4 step 4.3, and the issues themselves are independent work that begins **after** the scaffolding PR merges.

---

## 1. Constraints recap

Read these before any task. They're load-bearing on every step below:

- **`git commit --no-verify` is forbidden.** If a pre-commit hook fails, fix the underlying issue, re-stage, create a new commit. Never amend.
- **No `any` outside `*.test.ts` / `*.spec.ts`.** ESLint flat config enforces; CI re-enforces with `--max-warnings 0`.
- **No `// eslint-disable`, `// eslint-disable-next-line`, `// @ts-ignore`, `// @ts-expect-error`, `// @ts-nocheck` anywhere** in source or test files. Enforced by `@eslint-community/eslint-plugin-eslint-comments` and `@typescript-eslint/ban-ts-comment`.
- **Latest stable from npm; no pre-releases.** Single exception: Jest stays on 29.x until ts-jest 30 is stable. Verify with `npm view <pkg> version` at execute time — do not trust the version pins below if the timestamp has drifted; treat them as a snapshot to be confirmed.
- **Target ~10 commits across the entire scaffolding PR.** No "fix lint" commits — fix locally, then commit.
- All work lands via PR. Nothing pushed directly to `main` or `develop` after the very first bootstrap commit.

## 2. Phase 3 architecture (the shape execution will take)

```
┌─ §4.1 Pre-scaffold (no PR, no commits beyond initial bootstrap)
│   git init → main bootstrap commit → push → develop branch
│   gh: create org repo, set default to develop, branch protection
│   gh: project board, labels, milestones, v0.1 issue backlog
│
└─ §4.2 chore/initial-scaffolding branch off develop
    ├─ Commit 1: Nx workspace + root tooling
    ├─ Commit 2: Lint + format + commit discipline + Husky
    ├─ Commit 3: Toolchain negative-test verification
    ├─ Commit 4: packages/core (interfaces + skeleton router + types)
    ├─ Commit 5: packages/adapter-{ollama,openai-compatible,anthropic}
    ├─ Commit 6: apps/demo-cli + Dockerfile + docker-compose.yml
    ├─ Commit 7: apps/docs Fumadocs scaffold
    ├─ Commit 8: GitHub Actions workflows (CI, release, codeql, dco, project-board, refresh-agents-md)
    ├─ Commit 9: Repo automation (changesets, renovate, knip, codecov, devcontainer, .claude/, scaffold script)
    └─ Commit 10: Top-level docs (root README, root CLAUDE.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, docs/STRUCTURE.md)

§4.3 Open PR chore/initial-scaffolding → develop, verify CI, merge

§4.4 Post-merge docs PR: gitnexus analyze, commit AGENTS.md + .claude/skills/

§4.5 Summary handoff
```

## 3. Complete file inventory

Every file the scaffolding PR creates, grouped by commit. Use this as the master checklist when reviewing the PR diff.

### Commit 1 — Nx workspace + root tooling

```
package.json                     # root: workspace scripts, devDeps, packageManager pin
pnpm-workspace.yaml              # packages: ['packages/*', 'apps/*']
.npmrc                           # save-exact=true, engine-strict=true
.nvmrc                           # 24.x.y (pinned at execute time)
nx.json                          # Nx workspace config
tsconfig.base.json               # shared strict compiler options
tsconfig.json                    # project references stub
.gitattributes                   # text=auto, eol=lf
.gitignore                       # Node, Nx, build, OS, IDE artifacts
.editorconfig                    # 2 spaces, LF, trim trailing whitespace
```

### Commit 2 — Lint + format + commit discipline

```
eslint.config.mjs                # flat config, strict-type-checked, ban-ts-comment, no-eslint-disable
.prettierrc                      # 100 cols, single quotes, trailing comma all
.prettierignore                  # dist, coverage, .nx, pnpm-lock.yaml
commitlint.config.mjs            # @commitlint/config-conventional
.husky/pre-commit                # lint-staged + tsc --noEmit + nx affected:test
.husky/commit-msg                # commitlint
.lintstagedrc.mjs                # ESLint + Prettier per file type
```

### Commit 3 — Negative-test verification

This commit does not add files. It runs verification commands (see §4.2 / Commit 3) and produces no diff if everything passes. If verification fails, fix the offending config from Commit 2 in a follow-up amend... wait — **rule says never amend.** Correction: if Commit 3 verification fails, the fix is a regular commit `chore(lint): tighten config to forbid <X>` then re-run verification. The plan accepts one "fix" commit here as a real, legitimate hardening; it does not count toward "fix lint" commits because it's hardening, not patching a slip.

### Commit 4 — `@tierfall/core`

```
packages/core/package.json
packages/core/project.json
packages/core/tsconfig.json
packages/core/tsup.config.ts
packages/core/CLAUDE.md
packages/core/README.md
packages/core/src/index.ts
packages/core/src/adapter.ts          # Adapter interface
packages/core/src/tier.ts             # Tier enum + capability shape
packages/core/src/types.ts            # LLMRequest, LLMResponse, FallDiagnostic
packages/core/src/router.ts           # skeleton — throws "not implemented", real logic = issue #2
packages/core/src/policy.ts           # skeleton — throws "not implemented", real logic = issue #3
packages/core/src/errors.ts           # error taxonomy (BudgetExceeded, CapabilityMismatch, NoTierAvailable, ProviderUnavailable)
packages/core/test/adapter.test.ts    # passes: validates interface shape compiles
packages/core/test/router.test.ts     # FAILS: red TDD test for issue #2
packages/core/test/policy.test.ts     # FAILS: red TDD test for issue #3
```

### Commit 5 — Three adapter packages

For each `adapter-{ollama,openai-compatible,anthropic}`:

```
packages/adapter-X/package.json
packages/adapter-X/project.json
packages/adapter-X/tsconfig.json
packages/adapter-X/tsup.config.ts
packages/adapter-X/CLAUDE.md
packages/adapter-X/README.md
packages/adapter-X/src/index.ts
packages/adapter-X/src/adapter.ts            # skeleton implementing @tierfall/core's Adapter — throws on real calls
packages/adapter-X/test/adapter.test.ts      # FAILS: red TDD test for issue #5/6/8
```

Plus, only for `adapter-openai-compatible`:

```
packages/adapter-openai-compatible/src/presets.ts        # skeleton, throws — real implementation = issue #7
packages/adapter-openai-compatible/src/presets/index.ts  # re-export for /presets sub-export
packages/adapter-openai-compatible/test/presets.test.ts  # FAILS: red TDD test for issue #7
```

### Commit 6 — `apps/demo-cli`

```
apps/demo-cli/package.json
apps/demo-cli/project.json
apps/demo-cli/tsconfig.json
apps/demo-cli/tsup.config.ts
apps/demo-cli/CLAUDE.md
apps/demo-cli/README.md
apps/demo-cli/.dockerignore
apps/demo-cli/Dockerfile           # multi-stage Alpine, USER node
apps/demo-cli/docker-compose.yml   # demo + ollama + ollama-init
apps/demo-cli/src/main.ts          # stub: logs "scenarios not yet implemented — see issue #9"
apps/demo-cli/.env.example         # cloud API key placeholders, all empty
```

### Commit 7 — `apps/docs` Fumadocs scaffold

```
apps/docs/package.json
apps/docs/project.json
apps/docs/tsconfig.json
apps/docs/next.config.mjs
apps/docs/source.config.ts
apps/docs/CLAUDE.md
apps/docs/README.md
apps/docs/app/layout.tsx
apps/docs/app/(home)/page.tsx              # landing
apps/docs/app/docs/[[...slug]]/page.tsx    # MDX route
apps/docs/app/docs/layout.tsx              # docs shell
apps/docs/lib/source.ts
apps/docs/content/docs/index.mdx           # "Welcome — what works today"
apps/docs/content/docs/meta.json
apps/docs/content/docs/concepts/tiers.mdx  # placeholder scaffolding (full content = issue #10)
apps/docs/content/docs/concepts/meta.json
```

### Commit 8 — GitHub Actions workflows

```
.github/workflows/ci.yml                  # PRs → develop: lint, typecheck, test, build, publint, attw, knip
.github/workflows/release.yml             # main-only: changesets publish + tag
.github/workflows/codeql.yml              # weekly + PR security analysis
.github/workflows/dco.yml                 # require Signed-off-by trailer
.github/workflows/project-board.yml       # auto-move kanban on PR open/close
.github/workflows/refresh-agents-md.yml   # weekly cron: gitnexus analyze → PR if diff
.github/ISSUE_TEMPLATE/bug.yml
.github/ISSUE_TEMPLATE/feature.yml
.github/ISSUE_TEMPLATE/adapter.yml
.github/PULL_REQUEST_TEMPLATE.md
.github/CODEOWNERS
.github/dependabot.yml                    # security-only (Renovate handles version bumps)
```

### Commit 9 — Repo automation

```
.changeset/config.json                # changesets config
.changeset/README.md                  # standard changesets readme
renovate.json                         # auto-merge dev-dep patches on green CI
knip.json                             # finds unused exports/deps; CI step
codecov.yml                           # badge-only, no gating
.devcontainer/devcontainer.json       # Node 24 + pnpm setup
.claude/settings.json                 # hooks, allowed tools, output style
.claude/commands/new-adapter.md       # /new-adapter <name>
.claude/commands/check-vendor-neutrality.md
.claude/commands/release-prep.md
.claudeignore                         # populated up-front
tools/scaffold-adapter.ts             # `pnpm scaffold:adapter <name>`
```

### Commit 10 — Top-level docs

```
LICENSE                               # Apache 2.0 (full text)
README.md                             # vendor-rotation example, badges, status, links
CLAUDE.md                             # root: ≤80 lines, high-level
CONTRIBUTING.md                       # canonical rule source
CODE_OF_CONDUCT.md                    # Contributor Covenant 2.1
CHANGELOG.md                          # empty stub, "Unreleased"
SECURITY.md                           # vuln disclosure pointer
docs/STRUCTURE.md                     # canonical tree (also auto-updated by Husky)
.env.example                          # root mirror of demo's .env.example
```

The total spec file count for the scaffolding PR is approximately **115 files** across 10 commits.

---

## 4. Execution

### 4.0 — Pre-flight (verify before any tooling runs)

- [ ] **4.0.1 — Verify CLI prerequisites are installed.**

```bash
node --version          # expect: v24.x
pnpm --version          # expect: >= 10 (if missing: corepack enable && corepack prepare pnpm@latest --activate)
gh --version            # expect: any recent (if missing: install GitHub CLI)
docker --version        # expect: any recent
git --version           # expect: any recent
```

- [ ] **4.0.2 — Verify `gh` is authenticated to the `tierfall` org with `repo`, `workflow`, `project` scopes.**

```bash
gh auth status
# If not authenticated or missing scopes:
gh auth login --scopes "repo,workflow,project,admin:org"
```

If the user must authenticate interactively, surface that here and stop. Do not proceed until `gh auth status` reports all three scopes.

- [ ] **4.0.3 — Confirm Node version pins.** Look up latest stable Node 24 patch:

```bash
npm view node version 2>/dev/null || true
# Authoritative source: nodejs.org/en/about/previous-releases
```

Record the exact patch (e.g., `24.4.0`) for use in `.nvmrc`, Docker base image, and `engines.node`.

- [ ] **4.0.4 — Verify versions for every pinned dep on npm.** Run for each:

```bash
for pkg in nx eslint @typescript-eslint/parser typescript prettier husky lint-staged \
           @commitlint/cli @commitlint/config-conventional tsx tsup fumadocs-ui fumadocs-core \
           @changesets/cli knip publint @arethetypeswrong/cli jest ts-jest @types/jest; do
  printf "%-40s %s\n" "$pkg" "$(npm view "$pkg" version)"
done
```

Record the latest stable for each. **Special-case:** Jest must stay on 29.x until ts-jest 30 is stable. Confirm by:

```bash
npm view jest version
npm view ts-jest version
```

If ts-jest's stable is still in the 29.x line (per kickoff prompt: `29.4.10`), pin Jest to `29.7.0`. If ts-jest 30 is now stable, the constraint is lifted and both go to 30.x.

### 4.1 — GitHub setup (no commits beyond the very first)

- [ ] **4.1.1 — Initialize the local repository.**

```bash
mkdir -p /home/ronyv/Develop/Projects/tierfall
cd /home/ronyv/Develop/Projects/tierfall
git init -b main
```

Expected: `Initialized empty Git repository in .../.git/`.

- [ ] **4.1.2 — Create the very first bootstrap commit on `main`.**

This is the **only** commit that lands directly on `main` outside a release. It contains:

- `LICENSE` (Apache-2.0 full text — see Commit 10 for content)
- `README.md` (one-paragraph stub — full content lands in Commit 10's PR)
- `.gitignore` (Node + Nx ignore list — see Commit 1 for content)

Create the three files with this exact content for the bootstrap:

`.gitignore`:

```
node_modules/
dist/
coverage/
.nx/
.next/
.turbo/
*.log
*.tsbuildinfo
.env
.env.local
.DS_Store
```

`README.md`:

```markdown
# TierFall

> Local-first AI routing for TypeScript. **Fall, never climb.**

Bootstrapping in progress — see [docs/superpowers/specs/](docs/superpowers/specs/) for design.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
```

`LICENSE`: full text from `https://www.apache.org/licenses/LICENSE-2.0.txt` (the standard Apache 2.0 license). Copyright line: `Copyright 2026 TierFall contributors`.

Stage and commit:

```bash
git add LICENSE README.md .gitignore
git commit -s -m "chore: initial bootstrap"
```

Note: `-s` adds `Signed-off-by` per DCO. Every commit in the project must use `-s`.

- [ ] **4.1.3 — Create the GitHub repository and push `main`.**

```bash
gh repo create tierfall/tierfall \
  --public \
  --description "Local-first AI routing for TypeScript. Fall, never climb." \
  --source . \
  --remote origin \
  --push
```

Expected: repo exists at `https://github.com/tierfall/tierfall`, `main` is pushed.

- [ ] **4.1.4 — Create `develop` and push.**

```bash
git checkout -b develop
git push -u origin develop
```

- [ ] **4.1.5 — Set `develop` as the default branch on GitHub.**

```bash
gh repo edit tierfall/tierfall --default-branch develop
```

Verify:

```bash
gh repo view tierfall/tierfall --json defaultBranchRef --jq .defaultBranchRef.name
# Expected: develop
```

- [ ] **4.1.6 — Configure branch protection on `develop`.**

Use `gh api` to PUT the rule set:

```bash
gh api -X PUT "repos/tierfall/tierfall/branches/develop/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "test", "build", "publint", "attw", "knip", "CodeQL"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

The named status checks (`lint`, `typecheck`, etc.) must match the job names that will appear in `ci.yml` (Commit 8). If they don't match, branches won't be blocked by missing checks. Cross-reference Commit 8 task list before running this.

- [ ] **4.1.7 — Configure branch protection on `main` (stricter).**

```bash
gh api -X PUT "repos/tierfall/tierfall/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "test", "build", "publint", "attw", "knip", "CodeQL"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

The "PRs must originate from `develop`" constraint isn't directly expressible in branch protection rules. Enforced two ways: (1) Commit 8's `release.yml` validates `github.event.pull_request.head.ref == 'develop'` and fails CI otherwise; (2) `CODEOWNERS` requires review by `@tierfall/maintainers` for any change touching `main` (the team grants are out-of-band, done once by the human owner).

- [ ] **4.1.8 — Create the GitHub Project board.**

```bash
PROJECT_ID=$(gh project create --owner tierfall --title "TierFall v0.x" --format json | jq -r .id)
echo "Project ID: $PROJECT_ID"
```

Add the five status columns:

```bash
# gh CLI v2.49+ supports field/option creation:
gh project field-create $PROJECT_ID --owner tierfall \
  --name "Status" --data-type SINGLE_SELECT \
  --single-select-options "Backlog,Ready,In Progress,In Review,Done"
```

Verify the field exists:

```bash
gh project field-list $PROJECT_ID --owner tierfall
```

If the column field already exists with different options, modify it; do not duplicate.

- [ ] **4.1.9 — Create labels.**

Run this script (idempotent — use `--force` to overwrite color/description on re-run):

```bash
# Areas (blue)
gh label create "area:core" --color "0E4D92" --description "packages/core" --force
gh label create "area:adapter" --color "1F6FBF" --description "any packages/adapter-*" --force
gh label create "area:demo" --color "2E86DE" --description "apps/demo-cli" --force
gh label create "area:docs" --color "3F92EA" --description "apps/docs (Fumadocs)" --force
gh label create "area:ci" --color "5DA9F1" --description ".github, husky, lint, tsconfig" --force
gh label create "area:meta" --color "7BBEF6" --description "governance, README, repo housekeeping" --force

# Types (green)
gh label create "type:feature" --color "0E8A16" --description "new behavior" --force
gh label create "type:bug" --color "D73A4A" --description "broken behavior" --force
gh label create "type:refactor" --color "33CC66" --description "internal change, no behavior change" --force
gh label create "type:perf" --color "44DD77" --description "measurable performance work" --force
gh label create "type:docs" --color "55EE88" --description "documentation only" --force
gh label create "type:test" --color "66FF99" --description "test-only changes" --force
gh label create "type:chore" --color "77FFAA" --description "tooling, build, deps" --force
gh label create "type:security" --color "B60205" --description "security fix or hardening" --force
gh label create "type:rfc" --color "5319E7" --description "proposal/discussion before code" --force

# Priorities (red→green)
gh label create "prio:p0" --color "B60205" --description "critical, blocks release" --force
gh label create "prio:p1" --color "D93F0B" --description "high, ship this milestone" --force
gh label create "prio:p2" --color "FBCA04" --description "normal" --force
gh label create "prio:p3" --color "0E8A16" --description "backlog / nice-to-have" --force

# Platforms (purple)
gh label create "platform:node" --color "5319E7" --description "v0.1" --force
gh label create "platform:browser" --color "6D28D9" --description "v0.2" --force
gh label create "platform:react-native" --color "8B5CF6" --description "v0.3" --force
gh label create "platform:edge" --color "A78BFA" --description "future" --force

# Adapters (cyan)
gh label create "adapter:ollama" --color "0E7490" --description "" --force
gh label create "adapter:openai-compatible" --color "0891B2" --description "" --force
gh label create "adapter:anthropic" --color "06B6D4" --description "" --force

# Status (unprefixed)
gh label create "good-first-issue" --color "7057FF" --description "documented onramp" --force
gh label create "help-wanted" --color "008672" --description "community contribution welcome" --force
gh label create "needs-design" --color "FBCA04" --description "RFC required before implementation" --force
gh label create "needs-repro" --color "F9D0C4" --description "bug missing reproduction steps" --force
gh label create "blocked" --color "E11D48" --description "blocked on external dependency" --force
```

Verify:

```bash
gh label list --limit 100
```

Expected: ~30 labels.

- [ ] **4.1.10 — Create milestones.**

```bash
gh api -X POST "repos/tierfall/tierfall/milestones" -f title="v0.1.0 — Foundation" -f description="Core router + 3 adapters (Ollama, OpenAI-compatible, Anthropic) + demo + docs site live. Non-goals: browser, RN, tool calls, caching. Soft target: Q3 2026."
gh api -X POST "repos/tierfall/tierfall/milestones" -f title="v0.2.0 — Browser" -f description="WebLLM + transformers.js adapters; browser demo. Soft target: Q4 2026."
gh api -X POST "repos/tierfall/tierfall/milestones" -f title="v0.3.0 — Mobile" -f description="llama.rn adapter; RN demo (non-Docker, Expo-based). Soft target: Q1 2027."
gh api -X POST "repos/tierfall/tierfall/milestones" -f title="v0.4.0 — Tools" -f description="Tool calls + structured output across all adapters. Soft target: Q2 2027."
gh api -X POST "repos/tierfall/tierfall/milestones" -f title="v0.5.0 — Caching" -f description="Response caching + semantic caching layer. Soft target: Q3 2027."
gh api -X POST "repos/tierfall/tierfall/milestones" -f title="v1.0.0 — AI SDK compat" -f description="Vercel AI SDK compatibility shim, API freeze, stability commitment. Soft target: Q4 2027."
```

Verify:

```bash
gh api "repos/tierfall/tierfall/milestones" --jq '.[] | .title'
# Expected: all six titles listed
```

- [ ] **4.1.11 — Create issue #1 (the scaffolding issue itself).**

```bash
gh issue create \
  --title "Initial repository scaffolding" \
  --body-file - \
  --label "type:chore,area:meta,prio:p0,area:ci" \
  --milestone "v0.1.0 — Foundation" <<'BODY'
Bootstrap the TierFall monorepo per the brainstorm spec at `docs/superpowers/specs/2026-05-20-tierfall-bootstrap-design.md` and the implementation plan at `docs/superpowers/plans/2026-05-20-tierfall-bootstrap.md`.

## Acceptance criteria

- [ ] Nx pnpm workspace with `packages/{core,adapter-ollama,adapter-openai-compatible,adapter-anthropic}` and `apps/{demo-cli,docs}` scaffolded
- [ ] Strict ESLint flat config + Prettier + `tsc --noEmit` enforced via Husky pre-commit
- [ ] Negative test: `git commit` of code containing `: any` (outside test) or `// eslint-disable-next-line` is blocked locally and would also fail CI
- [ ] CI workflow `ci.yml` green on the scaffolding PR with named jobs: lint, typecheck, test, build, publint, attw, knip, CodeQL
- [ ] `release.yml` exists and gates merges into `main` to PRs originating from `develop`
- [ ] `docker compose -f apps/demo-cli/docker-compose.yml up` boots Ollama and the demo container; demo logs "scenarios not yet implemented" and exits cleanly
- [ ] Fumadocs site `apps/docs` builds with the v0.1 docs skeleton
- [ ] All four `prio:p1`+ v0.1 issues exist in the project board's Backlog column (the remaining 14 backlog issues from this plan's §5)
- [ ] Root README, root CLAUDE.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, docs/STRUCTURE.md present
- [ ] `.claude/commands/{new-adapter,check-vendor-neutrality,release-prep}.md` committed

## Out of scope (tracked in subsequent issues)

Adapter implementations, router/policy real logic, demo scenario logic, full Fumadocs content. Those are issues #2–#15 created alongside this one.
BODY
```

Record the issue URL — needed for the PR `Closes #1` line.

- [ ] **4.1.12 — Add issue #1 to the project board and set its Status to "In Progress".**

```bash
ISSUE_URL=$(gh issue view 1 --json url --jq .url)
gh project item-add $PROJECT_ID --owner tierfall --url $ISSUE_URL
# Set status; field IDs come from project field-list:
# gh project item-edit ... --field-id ... --single-select-option-id ...
# Exact command requires fetching field/option IDs first — execute interactively.
```

Note: `gh project` status edits require fetching field + option IDs. Build a small helper:

```bash
STATUS_FIELD=$(gh project field-list $PROJECT_ID --owner tierfall --format json | jq -r '.fields[] | select(.name=="Status")')
STATUS_FIELD_ID=$(echo $STATUS_FIELD | jq -r .id)
IN_PROGRESS_OPTION_ID=$(echo $STATUS_FIELD | jq -r '.options[] | select(.name=="In Progress") | .id')
ITEM_ID=$(gh project item-list $PROJECT_ID --owner tierfall --format json | jq -r ".items[] | select(.content.url==\"$ISSUE_URL\") | .id")
gh project item-edit --id $ITEM_ID --field-id $STATUS_FIELD_ID --single-select-option-id $IN_PROGRESS_OPTION_ID --project-id $PROJECT_ID
```

- [ ] **4.1.13 — Create the v0.1 backlog issues #2–#15** (the 14 remaining issues from §5). Each issue is created with the body, labels, and milestone listed in §5; each is then added to the project board in column "Backlog" (using the same field-ID dance as 4.1.12 but with the Backlog option ID).

Execute the batch via `tools/seed-backlog.sh` — a one-off helper script that lives in `$CLAUDE_JOB_DIR` during execution, not committed:

```bash
cat > "$CLAUDE_JOB_DIR/seed-backlog.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
# (Body is generated at execute time from §5's issue table.)
SH
chmod +x "$CLAUDE_JOB_DIR/seed-backlog.sh"
"$CLAUDE_JOB_DIR/seed-backlog.sh"
```

Verify:

```bash
gh issue list --milestone "v0.1.0 — Foundation" --limit 30
# Expected: 15 issues total (#1 scaffolding + #2–#15 backlog)
```

- [ ] **4.1.14 — Branch off `develop` for the scaffolding work.**

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b chore/initial-scaffolding
```

All commits from §4.2 land on this branch.

### 4.2 — Scaffolding commits on `chore/initial-scaffolding`

#### Commit 1 — Nx workspace + root tooling

- [ ] **4.2.1.1 — Initialize the Nx workspace using pnpm.**

```bash
pnpm dlx create-nx-workspace@latest tierfall-init --preset=ts --pm=pnpm --workspaceType=integrated --nxCloud=skip
```

Then move the generated files into the current directory:

```bash
shopt -s dotglob
mv tierfall-init/* tierfall-init/.* . 2>/dev/null || true
rmdir tierfall-init
shopt -u dotglob
```

Why this dance: `create-nx-workspace` insists on a fresh directory. Generating into a sibling then moving in is the cleanest path that preserves the prior `LICENSE` / `README.md` / `.gitignore`.

Resolve any file collisions in favor of files already in `tierfall/` (LICENSE, README.md, .gitignore must stay as committed in §4.1.2).

- [ ] **4.2.1.2 — Verify Nx structure.**

```bash
ls -la
# Expected: package.json, pnpm-workspace.yaml, nx.json, tsconfig.base.json, .npmrc
```

If `packages/` or `apps/` directories were generated, **delete them** — we create those ourselves with explicit structures in Commits 4–7.

```bash
rm -rf packages apps
```

- [ ] **4.2.1.3 — Replace generated `package.json` with the canonical version.**

```json
{
  "name": "tierfall",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@<PIN>",
  "engines": {
    "node": ">=24.0.0 <25.0.0",
    "pnpm": ">=10.0.0"
  },
  "scripts": {
    "build": "nx run-many --target=build",
    "test": "nx run-many --target=test",
    "lint": "nx run-many --target=lint",
    "typecheck": "nx run-many --target=typecheck",
    "check": "nx run-many --target=lint,typecheck,test,build --parallel=3",
    "format": "prettier --write --log-level warn \"**/*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml}\"",
    "format:check": "prettier --check --log-level warn \"**/*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml}\"",
    "publint": "pnpm -r --filter \"./packages/*\" exec publint",
    "attw": "pnpm -r --filter \"./packages/*\" exec attw --pack .",
    "knip": "knip",
    "changeset": "changeset",
    "changeset:version": "changeset version && pnpm install --lockfile-only",
    "changeset:publish": "pnpm build && changeset publish",
    "scaffold:adapter": "tsx tools/scaffold-adapter.ts",
    "prepare": "husky"
  },
  "devDependencies": {
    "@arethetypeswrong/cli": "<PIN>",
    "@changesets/cli": "<PIN>",
    "@commitlint/cli": "<PIN>",
    "@commitlint/config-conventional": "<PIN>",
    "@eslint-community/eslint-plugin-eslint-comments": "<PIN>",
    "@types/jest": "<PIN>",
    "@types/node": "<PIN>",
    "@typescript-eslint/eslint-plugin": "<PIN>",
    "@typescript-eslint/parser": "<PIN>",
    "eslint": "<PIN>",
    "eslint-config-prettier": "<PIN>",
    "husky": "<PIN>",
    "jest": "29.7.0",
    "knip": "<PIN>",
    "lint-staged": "<PIN>",
    "nx": "<PIN>",
    "prettier": "<PIN>",
    "publint": "<PIN>",
    "ts-jest": "29.4.10",
    "tsup": "<PIN>",
    "tsx": "<PIN>",
    "typescript": "<PIN>"
  }
}
```

Replace each `<PIN>` with the value recorded in §4.0.4. The `packageManager` field gets the corepack pin (e.g., `pnpm@10.10.0`).

- [ ] **4.2.1.4 — Replace generated `pnpm-workspace.yaml`.**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **4.2.1.5 — Write `.npmrc`.**

```
save-exact=true
engine-strict=true
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **4.2.1.6 — Write `.nvmrc`.**

Single line: the Node 24 patch recorded in §4.0.3 (e.g., `24.4.0`).

- [ ] **4.2.1.7 — Write `nx.json`.**

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)",
      "!{projectRoot}/tsconfig.spec.json",
      "!{projectRoot}/jest.config.[jt]s"
    ],
    "sharedGlobals": ["{workspaceRoot}/eslint.config.mjs", "{workspaceRoot}/tsconfig.base.json"]
  },
  "targetDefaults": {
    "build": { "cache": true, "inputs": ["production", "^production"], "dependsOn": ["^build"] },
    "test": { "cache": true, "inputs": ["default", "^production"] },
    "lint": { "cache": true, "inputs": ["default", "{workspaceRoot}/eslint.config.mjs"] },
    "typecheck": { "cache": true, "inputs": ["default", "^production"] }
  },
  "defaultBase": "develop"
}
```

- [ ] **4.2.1.8 — Write `tsconfig.base.json`.**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": false
  },
  "exclude": ["node_modules", "dist", "coverage", "**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **4.2.1.9 — Write `tsconfig.json` (project references stub; updated in Commits 4–7).**

```json
{
  "files": [],
  "references": []
}
```

- [ ] **4.2.1.10 — Write `.gitattributes`.**

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.svg text
pnpm-lock.yaml -diff
```

- [ ] **4.2.1.11 — Write `.editorconfig`.**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **4.2.1.12 — Update `.gitignore` to add Nx + Jest paths.**

Append to the bootstrap `.gitignore`:

```
# Nx
.nx/cache
.nx/workspace-data

# Jest
.jest-cache/

# Generated
*.tgz
```

- [ ] **4.2.1.13 — Install dependencies.**

```bash
pnpm install
```

Expected: clean install, lockfile written. If any pin in `package.json` doesn't resolve, the install fails — fix pins in `package.json` (do not commit the failure).

- [ ] **4.2.1.14 — Verify root sanity.**

```bash
pnpm exec tsc --noEmit          # Expect: no errors (nothing to compile yet, exit 0)
pnpm exec nx --version          # Expect: Nx version printed
```

- [ ] **4.2.1.15 — Stage and commit.**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc .nvmrc \
        nx.json tsconfig.base.json tsconfig.json .gitattributes .editorconfig .gitignore
git commit -s -m "chore(workspace): scaffold Nx + pnpm monorepo

- pnpm workspace targeting packages/* and apps/*
- Nx 22 with cache config and default base develop
- Strict tsconfig.base.json (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
- Pin Node 24 + pnpm 10 via engines + .nvmrc"
```

#### Commit 2 — Lint + format + commit discipline

- [ ] **4.2.2.1 — Write `eslint.config.mjs`.**

```js
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintComments.recommended,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@eslint-community/eslint-comments/no-use': ['error', { allow: [] }],
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
    rules: {
      // Tests may use `any` for mock flexibility — narrow exception per spec.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.nx/**',
      '**/.next/**',
      '**/node_modules/**',
      'tools/**/*.js',
      'apps/docs/.source/**',
    ],
  },
);
```

The key invariants:

- `@eslint-community/eslint-comments/no-use` with `allow: []` means **all** ESLint disable directives are errors. No escape hatch.
- `@typescript-eslint/ban-ts-comment` errors on every `@ts-*` comment.
- `no-explicit-any` errors in source, off in test files only.

- [ ] **4.2.2.2 — Write `.prettierrc`.**

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **4.2.2.3 — Write `.prettierignore`.**

```
node_modules
dist
coverage
.nx
.next
.turbo
pnpm-lock.yaml
*.tsbuildinfo
apps/docs/.source
CHANGELOG.md
```

- [ ] **4.2.2.4 — Write `commitlint.config.mjs`.**

```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-empty': [0],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
  },
};
```

- [ ] **4.2.2.5 — Initialize Husky.**

```bash
pnpm exec husky init
```

This creates `.husky/pre-commit` (default content) and adds `prepare: husky` to package.json (already done in 4.2.1.3).

- [ ] **4.2.2.6 — Overwrite `.husky/pre-commit`.**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm exec lint-staged
pnpm exec tsc --noEmit
pnpm exec nx affected --target=test --base=origin/develop --parallel=3
```

The `nx affected` is keyed off `origin/develop`. On fresh clones where origin isn't yet fetched, this falls back to the entire workspace — fine for v0.1 scale.

- [ ] **4.2.2.7 — Write `.husky/commit-msg`.**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm exec commitlint --edit "$1"
```

Make hooks executable:

```bash
chmod +x .husky/pre-commit .husky/commit-msg
```

- [ ] **4.2.2.8 — Write `.lintstagedrc.mjs`.**

```js
export default {
  '*.{ts,tsx,mjs,cjs,js}': ['eslint --max-warnings=0 --no-warn-ignored', 'prettier --check'],
  '*.{json,md,yml,yaml}': ['prettier --check'],
};
```

- [ ] **4.2.2.9 — Verify lint passes on the empty repo.**

```bash
pnpm exec eslint --max-warnings=0 .
# Expected: no files to lint (no source yet), exit 0
pnpm exec prettier --check .
# Expected: all files match, exit 0
```

- [ ] **4.2.2.10 — Commit.**

```bash
git add eslint.config.mjs .prettierrc .prettierignore commitlint.config.mjs \
        .husky/pre-commit .husky/commit-msg .lintstagedrc.mjs package.json
git commit -s -m "chore(lint): strict ESLint flat config + Prettier + Husky

- No \`any\` outside test files
- All ESLint disable directives banned (@eslint-community/eslint-comments)
- All @ts-* comments banned
- Pre-commit: lint-staged + tsc --noEmit + nx affected test
- Commit-msg: commitlint with conventional-commits"
```

#### Commit 3 — Toolchain negative-test verification

This is the **most important commit in the scaffolding** for matching the kickoff prompt's constraint #3 + #4 + #5: prove the toolchain rejects what it must reject.

- [ ] **4.2.3.1 — Negative test 1: forbidden `any` in source.**

Create a throwaway file:

```bash
mkdir -p packages/.verify
cat > packages/.verify/source.ts <<'TS'
export function leak(): any {
  return undefined;
}
TS

cat > packages/.verify/package.json <<'JSON'
{
  "name": "@tierfall/.verify",
  "version": "0.0.0",
  "private": true
}
JSON
```

Now try to commit it:

```bash
git add packages/.verify/
git commit -s -m "test: should be blocked by lint"
```

**Expected:** the commit fails. Output should mention `@typescript-eslint/no-explicit-any`. If the commit succeeds, the ESLint config is wrong — investigate and fix `eslint.config.mjs` before continuing.

- [ ] **4.2.3.2 — Negative test 2: forbidden lint-disable directive.**

Replace the throwaway file:

```bash
cat > packages/.verify/source.ts <<'TS'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const x: unknown = null;
TS
```

```bash
git add packages/.verify/source.ts
git commit -s -m "test: should be blocked by eslint-comments"
```

**Expected:** the commit fails. Output mentions `@eslint-community/eslint-comments/no-use`. If it succeeds, fix the plugin config.

- [ ] **4.2.3.3 — Negative test 3: forbidden `@ts-ignore`.**

```bash
cat > packages/.verify/source.ts <<'TS'
// @ts-ignore
export const x: string = 42;
TS
```

```bash
git add packages/.verify/source.ts
git commit -s -m "test: should be blocked by ban-ts-comment"
```

**Expected:** the commit fails. Output mentions `@typescript-eslint/ban-ts-comment`.

- [ ] **4.2.3.4 — Negative test 4: bypass attempt with `--no-verify`.**

```bash
git commit -s --no-verify -m "test: should be socially blocked"
```

This **will succeed locally** — Git itself can't be made to refuse `--no-verify`. The defense-in-depth is CI re-running the same checks (Commit 8 / `ci.yml`). Reset the commit:

```bash
git reset --hard HEAD~1
```

Document this explicitly in CONTRIBUTING.md (Commit 10): `--no-verify` is a project policy violation, enforced socially + by CI.

- [ ] **4.2.3.5 — Clean up the verification scratch.**

```bash
rm -rf packages/.verify
git status        # Expected: working tree clean (nothing was committed)
```

- [ ] **4.2.3.6 — Record verification in plan output.**

The commit-3 boundary produces **no diff**. Its outcome is the verification log. The executor prints something like:

```
Verification: ESLint blocks `any` in source ............................ ✅ PASS
Verification: ESLint blocks // eslint-disable-next-line ................. ✅ PASS
Verification: ESLint blocks // @ts-ignore ............................... ✅ PASS
Verification: --no-verify locally bypasses but CI will re-block ......... ⚠️ as designed
```

No commit. Proceed to Commit 4.

#### Commit 4 — `@tierfall/core`

- [ ] **4.2.4.1 — Create directory.**

```bash
mkdir -p packages/core/src packages/core/test
```

- [ ] **4.2.4.2 — Write `packages/core/package.json`.**

```json
{
  "name": "@tierfall/core",
  "version": "0.0.0",
  "description": "TierFall core: Adapter interface, fall-never-climb router, declarative policy",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/tierfall/tierfall.git",
    "directory": "packages/core"
  },
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "test": "jest",
    "lint": "eslint --max-warnings=0 --quiet src test",
    "typecheck": "tsc --noEmit --pretty false"
  },
  "devDependencies": {
    "tsup": "<PIN>",
    "typescript": "<PIN>",
    "jest": "29.7.0",
    "ts-jest": "29.4.10"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

- [ ] **4.2.4.3 — Write `packages/core/tsconfig.json`.**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts", "test/**/*"]
}
```

- [ ] **4.2.4.4 — Write `packages/core/tsup.config.ts`.**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
});
```

- [ ] **4.2.4.5 — Write `packages/core/project.json`.**

```json
{
  "name": "core",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "library",
  "sourceRoot": "packages/core/src",
  "targets": {
    "build": { "executor": "nx:run-script", "options": { "script": "build" } },
    "test": { "executor": "nx:run-script", "options": { "script": "test" } },
    "lint": { "executor": "nx:run-script", "options": { "script": "lint" } },
    "typecheck": { "executor": "nx:run-script", "options": { "script": "typecheck" } }
  }
}
```

- [ ] **4.2.4.6 — Write `packages/core/src/tier.ts`.**

```ts
/**
 * The four routing tiers TierFall recognizes.
 * Order is significant: lower index = "more expensive / more capable".
 * Falling moves toward higher index. Climbing moves toward lower index
 * and requires explicit policy override.
 */
export const TIERS = ['premium-cloud', 'cheap-cloud', 'self-hosted-edge', 'on-device'] as const;

export type Tier = (typeof TIERS)[number];

/**
 * The capabilities an adapter declares it can satisfy.
 * Used by the Router to match a request's needs against available adapters
 * and to detect capability mismatches that trigger a fall.
 */
export interface AdapterCapability {
  readonly contextWindowTokens: number;
  readonly supportsTools: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsStructuredOutput: boolean;
  /** Estimated USD per million input tokens. `null` for free (e.g., on-device). */
  readonly costPerMillionInputTokens: number | null;
  /** Estimated USD per million output tokens. `null` for free. */
  readonly costPerMillionOutputTokens: number | null;
}
```

- [ ] **4.2.4.7 — Write `packages/core/src/types.ts`.**

```ts
import type { Tier } from './tier.js';

export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LLMRequest {
  readonly model: string;
  readonly messages: readonly LLMMessage[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Hard cap on USD for this single request across any tier. */
  readonly maxCostUSD?: number;
  /** Required capabilities; the router uses these to evaluate fits. */
  readonly requires?: Partial<{
    tools: boolean;
    structuredOutput: boolean;
    streaming: boolean;
    minContextWindowTokens: number;
  }>;
}

export interface LLMUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUSD: number;
}

export interface LLMResponse {
  readonly text: string;
  readonly tier: Tier;
  readonly model: string;
  readonly usage: LLMUsage;
  readonly fallChain: readonly FallDiagnostic[];
}

export interface FallDiagnostic {
  readonly tier: Tier;
  readonly adapterName: string;
  readonly reason: 'budget' | 'capability' | 'provider-unavailable' | 'unknown';
  readonly detail: string;
}
```

- [ ] **4.2.4.8 — Write `packages/core/src/errors.ts`.**

```ts
import type { FallDiagnostic } from './types.js';

export class BudgetExceededError extends Error {
  override readonly name = 'BudgetExceededError';
  constructor(message: string) {
    super(message);
  }
}

export class CapabilityMismatchError extends Error {
  override readonly name = 'CapabilityMismatchError';
  constructor(message: string) {
    super(message);
  }
}

export class ProviderUnavailableError extends Error {
  override readonly name = 'ProviderUnavailableError';
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class NoTierAvailableError extends Error {
  override readonly name = 'NoTierAvailableError';
  constructor(
    message: string,
    readonly fallChain: readonly FallDiagnostic[],
  ) {
    super(message);
  }
}
```

- [ ] **4.2.4.9 — Write `packages/core/src/adapter.ts`.**

```ts
import type { AdapterCapability, Tier } from './tier.js';
import type { LLMRequest, LLMResponse } from './types.js';

/**
 * The contract every TierFall adapter implements.
 *
 * An adapter:
 * - Declares the tier(s) it can serve via `tier`
 * - Declares its capabilities via `capability`
 * - Executes requests via `complete()`
 *
 * Adapters MUST throw `ProviderUnavailableError` on network/auth failures,
 * `CapabilityMismatchError` if the request's `requires` cannot be satisfied,
 * and `BudgetExceededError` if execution would exceed the request's `maxCostUSD`.
 *
 * Implementations live in their own packages (`@tierfall/adapter-*`).
 * `@tierfall/core` exports this interface only; it never imports any adapter.
 */
export interface Adapter {
  readonly name: string;
  readonly tier: Tier;
  readonly capability: AdapterCapability;
  complete(request: LLMRequest): Promise<LLMResponse>;
}
```

- [ ] **4.2.4.10 — Write `packages/core/src/router.ts` (skeleton).**

```ts
import type { Adapter } from './adapter.js';
import type { LLMRequest, LLMResponse } from './types.js';

/**
 * Router state machine: "Fall, never climb."
 *
 * Given an ordered list of adapters (premium → on-device), the router attempts
 * the first adapter; on failure / budget / capability mismatch, it falls to
 * the next cheaper one. Climbing toward premium requires explicit policy
 * override (not yet implemented; tracked in issue #2).
 *
 * The skeleton below throws `Not implemented` to mark the boundary clearly
 * for the v0.1 implementation issue.
 */
export class Router {
  constructor(private readonly adapters: readonly Adapter[]) {
    if (adapters.length === 0) {
      throw new Error('Router requires at least one adapter');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- skeleton
  complete(_request: LLMRequest): Promise<LLMResponse> {
    throw new Error('Router.complete is not yet implemented — see issue #2');
  }
}
```

Wait — this has an `eslint-disable` directive, which our config bans. Replace with the unused-prefix pattern instead:

Re-write `packages/core/src/router.ts` (final):

```ts
import type { Adapter } from './adapter.js';
import type { LLMRequest, LLMResponse } from './types.js';

/**
 * Router state machine: "Fall, never climb."
 *
 * Given an ordered list of adapters (premium → on-device), the router attempts
 * the first adapter; on failure / budget / capability mismatch, it falls to
 * the next cheaper one. Climbing toward premium requires explicit policy
 * override (not yet implemented; tracked in issue #2).
 */
export class Router {
  constructor(private readonly adapters: readonly Adapter[]) {
    if (adapters.length === 0) {
      throw new Error('Router requires at least one adapter');
    }
  }

  complete(_request: LLMRequest): Promise<LLMResponse> {
    return Promise.reject(new Error('Router.complete is not yet implemented — see issue #2'));
  }
}
```

The `_` prefix exempts the parameter from the unused-vars rule per our ESLint config (`argsIgnorePattern: '^_'`).

- [ ] **4.2.4.11 — Write `packages/core/src/policy.ts` (skeleton).**

```ts
import type { Adapter } from './adapter.js';
import type { LLMRequest } from './types.js';

/**
 * Declarative policy evaluator: matches a request against available adapters
 * and produces the ordered fallback sequence the Router will attempt.
 *
 * Real implementation tracked in issue #3.
 */
export interface Policy {
  evaluate(request: LLMRequest, adapters: readonly Adapter[]): readonly Adapter[];
}

export class DefaultPolicy implements Policy {
  evaluate(_request: LLMRequest, _adapters: readonly Adapter[]): readonly Adapter[] {
    throw new Error('DefaultPolicy.evaluate is not yet implemented — see issue #3');
  }
}
```

- [ ] **4.2.4.12 — Write `packages/core/src/index.ts`.**

```ts
export type { Adapter } from './adapter.js';
export type { AdapterCapability, Tier } from './tier.js';
export { TIERS } from './tier.js';
export type { LLMRequest, LLMResponse, LLMMessage, LLMUsage, FallDiagnostic } from './types.js';
export { Router } from './router.js';
export { DefaultPolicy, type Policy } from './policy.js';
export {
  BudgetExceededError,
  CapabilityMismatchError,
  ProviderUnavailableError,
  NoTierAvailableError,
} from './errors.js';
```

- [ ] **4.2.4.13 — Write `packages/core/jest.config.js`.**

```js
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
};
```

- [ ] **4.2.4.14 — Write `packages/core/test/adapter.test.ts` (passes — proves the interface compiles).**

```ts
import type { Adapter, LLMRequest, LLMResponse } from '../src/index.js';

describe('Adapter interface', () => {
  it('can be implemented with the required shape', () => {
    const fake: Adapter = {
      name: 'fake',
      tier: 'on-device',
      capability: {
        contextWindowTokens: 8192,
        supportsTools: false,
        supportsStreaming: false,
        supportsStructuredOutput: false,
        costPerMillionInputTokens: null,
        costPerMillionOutputTokens: null,
      },
      complete: (_request: LLMRequest): Promise<LLMResponse> =>
        Promise.resolve({
          text: 'ok',
          tier: 'on-device',
          model: 'fake',
          usage: { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 },
          fallChain: [],
        }),
    };
    expect(fake.name).toBe('fake');
    expect(fake.tier).toBe('on-device');
  });
});
```

- [ ] **4.2.4.15 — Write `packages/core/test/router.test.ts` (FAILS — red TDD for issue #2).**

```ts
import { Router } from '../src/router.js';
import type { Adapter } from '../src/adapter.js';

function fakeAdapter(name: string, tier: Adapter['tier']): Adapter {
  return {
    name,
    tier,
    capability: {
      contextWindowTokens: 8192,
      supportsTools: false,
      supportsStreaming: false,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: null,
      costPerMillionOutputTokens: null,
    },
    complete: () =>
      Promise.resolve({
        text: `from ${name}`,
        tier,
        model: name,
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 },
        fallChain: [],
      }),
  };
}

describe('Router (issue #2 — currently failing TDD)', () => {
  it('completes via the first adapter when it succeeds', async () => {
    const router = new Router([fakeAdapter('premium', 'premium-cloud')]);
    const result = await router.complete({
      model: 'whatever',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from premium');
  });
});
```

The Jest run will fail (`Router.complete is not yet implemented`). That's the design — this test stays red until issue #2 is closed.

- [ ] **4.2.4.16 — Write `packages/core/test/policy.test.ts` (FAILS — red TDD for issue #3).**

```ts
import { DefaultPolicy } from '../src/policy.js';

describe('DefaultPolicy (issue #3 — currently failing TDD)', () => {
  it('orders adapters by tier expense, premium first', () => {
    const policy = new DefaultPolicy();
    const adapters = policy.evaluate({ model: 'm', messages: [] }, []);
    expect(adapters).toEqual([]);
  });
});
```

- [ ] **4.2.4.17 — Write `packages/core/CLAUDE.md`.**

```markdown
# packages/core — Claude context

`@tierfall/core` exports the **Adapter interface, Router, Policy types, shared types**,
and the **error taxonomy**. It contains **no adapter implementations** and **no vendor
SDK dependencies**. Anything that imports `@tierfall/core` MUST be safe to install
without dragging in OpenAI / Anthropic / Ollama SDKs.

## Key contracts

- `Adapter` — what every adapter package implements. See `src/adapter.ts`.
- `Router` — fall-never-climb state machine. Skeleton at scaffold; real logic = issue #2.
- `Policy` — declarative evaluator. Skeleton at scaffold; real logic = issue #3.

## Invariants

- Tier order is fixed: `premium-cloud → cheap-cloud → self-hosted-edge → on-device`.
- A "fall" moves toward higher tier index (cheaper). Climbing requires explicit policy.
- Adapters throw typed errors (`BudgetExceededError`, `CapabilityMismatchError`,
  `ProviderUnavailableError`); the Router catches and translates these into
  `FallDiagnostic` entries on the response's `fallChain`.

## When changing this package

Run `pnpm --filter @tierfall/core test` and verify the existing red TDD tests
in `test/router.test.ts` and `test/policy.test.ts` only flip green via the
issue they're tagged to. Don't make them pass by altering the test.
```

- [ ] **4.2.4.18 — Write `packages/core/README.md`.**

```markdown
# @tierfall/core

The core router, Adapter interface, and types for [TierFall](https://github.com/tierfall/tierfall).

## Install

\`\`\`bash
pnpm add @tierfall/core
\`\`\`

## Usage

Import the `Adapter` interface, implement it in your own adapter package (or use
one of the official adapters: `@tierfall/adapter-ollama`,
`@tierfall/adapter-openai-compatible`, `@tierfall/adapter-anthropic`), and pass
the resulting list to `Router`.

\`\`\`ts
import { Router } from '@tierfall/core';
// full example lands in the v0.1 docs (issue #10).
\`\`\`

## License

Apache-2.0
```

- [ ] **4.2.4.19 — Build and verify.**

```bash
pnpm --filter @tierfall/core build
pnpm --filter @tierfall/core typecheck
pnpm --filter @tierfall/core lint
pnpm --filter @tierfall/core test
```

Expected outcomes:

- `build` ✅ — produces `packages/core/dist/`
- `typecheck` ✅ — no type errors
- `lint` ✅ — no lint errors
- `test` ❌ — `adapter.test.ts` passes, `router.test.ts` and `policy.test.ts` FAIL as designed (red TDD)

Run a single test to confirm the failures are the expected ones:

```bash
pnpm --filter @tierfall/core test -- router.test.ts 2>&1 | tail -20
# Expected: failure mentioning "Router.complete is not yet implemented — see issue #2"
```

- [ ] **4.2.4.20 — Add `packages/core/tsconfig.json` to root project references.**

Update root `tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./packages/core" }]
}
```

- [ ] **4.2.4.21 — Commit.**

```bash
git add packages/core/ tsconfig.json
git commit -s -m "feat(core): scaffold @tierfall/core with Adapter interface and Router skeleton

- Adapter contract: tier, capability, complete()
- Router skeleton (real fall-never-climb logic = issue #2)
- DefaultPolicy skeleton (real evaluator = issue #3)
- Error taxonomy: Budget/Capability/Provider/NoTier
- TDD red tests for router and policy; passing test for Adapter shape"
```

#### Commit 5 — Three adapter packages

The three adapter packages share a common shape, scaffolded identically except for:

- Adapter name string (`'ollama'`, `'openai-compatible'`, `'anthropic'`)
- Default tier (`'on-device'`, `'cheap-cloud'`, `'premium-cloud'`)
- Capability defaults (per-vendor; see kickoff prompt for what each adapter advertises)
- `adapter-openai-compatible` only: extra `src/presets.ts`, `src/presets/index.ts`, `test/presets.test.ts`

- [ ] **4.2.5.1 — Use `pnpm scaffold:adapter` script… except it doesn't exist yet (it's Commit 9).** Instead, scaffold the three packages manually by repeating these tasks per adapter.

For each `name` in `[ollama, openai-compatible, anthropic]`:

- [ ] **4.2.5.X.1 — Create directory:** `mkdir -p packages/adapter-{name}/src packages/adapter-{name}/test`
- [ ] **4.2.5.X.2 — Write `packages/adapter-{name}/package.json`** (same shape as `@tierfall/core`'s, with `name: "@tierfall/adapter-{name}"`, an additional `dependencies: { "@tierfall/core": "workspace:*" }`, and for `adapter-openai-compatible` only the additional `exports` entry):

```json
"./presets": {
  "import": { "types": "./dist/presets/index.d.ts", "default": "./dist/presets/index.js" },
  "require": { "types": "./dist/presets/index.d.cts", "default": "./dist/presets/index.cjs" }
}
```

- [ ] **4.2.5.X.3 — Write `packages/adapter-{name}/tsconfig.json`** (same as core's, except `outDir`/`rootDir` accordingly)
- [ ] **4.2.5.X.4 — Write `packages/adapter-{name}/tsup.config.ts`** (same as core's; for `adapter-openai-compatible` add `'src/presets/index.ts'` to `entry`)
- [ ] **4.2.5.X.5 — Write `packages/adapter-{name}/project.json`** (same shape as core's, with `"name": "adapter-{name}"`)
- [ ] **4.2.5.X.6 — Write `packages/adapter-{name}/jest.config.js`** (same as core's)
- [ ] **4.2.5.X.7 — Write `packages/adapter-{name}/src/adapter.ts`** (skeleton):

```ts
import type { Adapter, AdapterCapability, LLMRequest, LLMResponse, Tier } from '@tierfall/core';

export interface {Name}AdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

export class {Name}Adapter implements Adapter {
  readonly name = '{name}';
  readonly tier: Tier;
  readonly capability: AdapterCapability;

  constructor(private readonly config: {Name}AdapterConfig) {
    this.tier = /* set per adapter — see below */;
    this.capability = { /* sensible defaults per adapter */ };
  }

  complete(_request: LLMRequest): Promise<LLMResponse> {
    return Promise.reject(
      new Error('{Name}Adapter.complete is not yet implemented — see issue #5/#6/#8'),
    );
  }
}
```

Substitutions: `{name}` and `{Name}` are replaced per adapter (e.g., `ollama` / `Ollama`). Per-adapter tier:

- `ollama` → `'on-device'`
- `openai-compatible` → `'cheap-cloud'` (presets override at instantiation time)
- `anthropic` → `'premium-cloud'`

- [ ] **4.2.5.X.8 — Write `packages/adapter-{name}/src/index.ts`:**

```ts
export { {Name}Adapter, type {Name}AdapterConfig } from './adapter.js';
```

- [ ] **4.2.5.X.9 — Write `packages/adapter-{name}/test/adapter.test.ts`** (FAILS — red TDD for the implementation issue):

```ts
import { {Name}Adapter } from '../src/adapter.js';

describe('{Name}Adapter (issue #5/#6/#8 — currently failing TDD)', () => {
  it('completes a basic request', async () => {
    const adapter = new {Name}Adapter({ model: 'test', baseUrl: 'http://localhost' });
    const result = await adapter.complete({
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBeTruthy();
  });
});
```

- [ ] **4.2.5.X.10 — Write `packages/adapter-{name}/CLAUDE.md`** (per the spec §3.4 — vendor-specific gotchas, API shape, default models)
- [ ] **4.2.5.X.11 — Write `packages/adapter-{name}/README.md`** (install + usage stub, "implementation pending issue #5/#6/#8")

- [ ] **4.2.5.4 — `adapter-openai-compatible`-only extras: `src/presets.ts`, `src/presets/index.ts`, `test/presets.test.ts`.**

`packages/adapter-openai-compatible/src/presets.ts`:

```ts
import type { OpenAICompatibleAdapterConfig } from './adapter.js';

/**
 * Presets are pre-configured base URLs + recommended-model defaults for popular
 * OpenAI-compatible providers. They are NOT defaults in code — users still
 * choose which preset (or BYO config) to use.
 *
 * Real implementations land in issue #7.
 */
export interface PresetFactory {
  (overrides?: Partial<OpenAICompatibleAdapterConfig>): OpenAICompatibleAdapterConfig;
}

export const presets: Record<string, PresetFactory> = {
  groq: (_o) => {
    throw new Error('groq preset is not yet implemented — see issue #7');
  },
  deepseek: (_o) => {
    throw new Error('deepseek preset is not yet implemented — see issue #7');
  },
  openai: (_o) => {
    throw new Error('openai preset is not yet implemented — see issue #7');
  },
  cerebras: (_o) => {
    throw new Error('cerebras preset is not yet implemented — see issue #7');
  },
  openrouter: (_o) => {
    throw new Error('openrouter preset is not yet implemented — see issue #7');
  },
};
```

`packages/adapter-openai-compatible/src/presets/index.ts` (sub-export entry):

```ts
export { presets, type PresetFactory } from '../presets.js';
```

`packages/adapter-openai-compatible/test/presets.test.ts` (FAILS):

```ts
import { presets } from '../src/presets.js';

describe('OpenAI-compatible presets (issue #7 — currently failing TDD)', () => {
  it('exposes the five v0.1 presets', () => {
    expect(Object.keys(presets).sort()).toEqual([
      'cerebras',
      'deepseek',
      'groq',
      'openai',
      'openrouter',
    ]);
  });

  it('groq preset produces a valid config with default model and base URL', () => {
    const config = presets.groq();
    expect(config.baseUrl).toContain('groq.com');
    expect(config.model).toBeTruthy();
  });
});
```

- [ ] **4.2.5.5 — Install dependencies (pnpm picks up new workspace packages).**

```bash
pnpm install
```

- [ ] **4.2.5.6 — Verify all four packages build and lint.**

```bash
pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-openai-compatible,adapter-anthropic
pnpm exec nx run-many --target=lint --projects=adapter-ollama,adapter-openai-compatible,adapter-anthropic
pnpm exec nx run-many --target=typecheck --projects=adapter-ollama,adapter-openai-compatible,adapter-anthropic
```

Expected: all green. The adapter `test` targets will fail as designed.

- [ ] **4.2.5.7 — Run `pnpm why @anthropic-ai/sdk` from `packages/core` to verify zero vendor dependencies.**

```bash
cd packages/core && pnpm why @anthropic-ai/sdk 2>&1 || true
# Expected: "No packages found" — proves vendor neutrality at the dep level.
cd ../..
```

Repeat for `openai`, `@ai-sdk/*`, `ollama`. None should appear in `@tierfall/core`'s dependency graph.

- [ ] **4.2.5.8 — Update root `tsconfig.json` project references.**

```json
{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/adapter-ollama" },
    { "path": "./packages/adapter-openai-compatible" },
    { "path": "./packages/adapter-anthropic" }
  ]
}
```

- [ ] **4.2.5.9 — Commit.**

```bash
git add packages/adapter-ollama packages/adapter-openai-compatible packages/adapter-anthropic tsconfig.json pnpm-lock.yaml
git commit -s -m "feat(adapters): scaffold Ollama, OpenAI-compatible, Anthropic adapters

- All three implement @tierfall/core's Adapter interface
- Skeletons throw 'not implemented — see issue #N' for the per-adapter issue
- adapter-openai-compatible includes /presets sub-export with five preset stubs
- Red TDD tests for each adapter (turn green via issues #5, #6, #7, #8)
- Verified @tierfall/core has no vendor SDK dependencies"
```

#### Commit 6 — `apps/demo-cli` + Docker stack

- [ ] **4.2.6.1 — Create directory.**

```bash
mkdir -p apps/demo-cli/src
```

- [ ] **4.2.6.2 — Write `apps/demo-cli/package.json`.**

```json
{
  "name": "@tierfall-app/demo-cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/main.ts",
    "start": "node dist/main.js",
    "lint": "eslint --max-warnings=0 --quiet src",
    "typecheck": "tsc --noEmit --pretty false"
  },
  "dependencies": {
    "@tierfall/core": "workspace:*",
    "@tierfall/adapter-ollama": "workspace:*",
    "@tierfall/adapter-openai-compatible": "workspace:*",
    "@tierfall/adapter-anthropic": "workspace:*"
  }
}
```

- [ ] **4.2.6.3 — Write `apps/demo-cli/tsconfig.json` and `apps/demo-cli/project.json`** (same shape as core's, with `"name": "demo-cli"` and `"projectType": "application"`).

- [ ] **4.2.6.4 — Write `apps/demo-cli/tsup.config.ts`.**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
});
```

CJS because Node loads it via `node dist/main.js` without an `--experimental-` flag for top-level await.

- [ ] **4.2.6.5 — Write `apps/demo-cli/src/main.ts`.**

```ts
async function main(): Promise<void> {
  // eslint-disable-next-line no-console -- this IS a CLI demo
  console.log(
    '[tierfall demo] Scaffolding complete. Scenario logic ships in issue #9.\n' +
      '[tierfall demo] Configured adapters from env:',
  );
  // eslint-disable-next-line no-console -- CLI demo
  console.log({
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? '(not set)',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***set***' : '(not set)',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***set***' : '(not set)',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? '***set***' : '(not set)',
  });
}

void main();
```

Wait — `eslint-disable` is banned. Fix by allowing `no-console` in `apps/demo-cli/**` via an ESLint override added to `eslint.config.mjs`. That override is a real config decision: the demo's purpose is to log to console. Add this block to `eslint.config.mjs` (re-edit the file added in 4.2.2.1):

```js
{
  files: ['apps/demo-cli/**/*.ts'],
  rules: {
    'no-console': 'off',
  },
},
```

Then the demo's `main.ts` can be:

```ts
async function main(): Promise<void> {
  console.log(
    '[tierfall demo] Scaffolding complete. Scenario logic ships in issue #9.\n' +
      '[tierfall demo] Configured adapters from env:',
  );
  console.log({
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? '(not set)',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***set***' : '(not set)',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***set***' : '(not set)',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? '***set***' : '(not set)',
  });
}

void main();
```

This config tweak gets bundled into the same commit (acceptable — it's a coherent change with the demo scaffold).

- [ ] **4.2.6.6 — Write `apps/demo-cli/.env.example`.**

```
# TierFall demo — all optional. Demo runs against Ollama only if these are absent.

# Anthropic (premium-cloud tier)
ANTHROPIC_API_KEY=

# OpenAI (premium-cloud tier via openai-compatible adapter)
OPENAI_API_KEY=

# DeepSeek (cheap-cloud tier via openai-compatible adapter)
DEEPSEEK_API_KEY=

# Ollama (on-device tier) — defaults to Compose-internal service name
OLLAMA_BASE_URL=http://ollama:11434
```

- [ ] **4.2.6.7 — Write `apps/demo-cli/.dockerignore`.**

```
node_modules
**/node_modules
dist
**/dist
.nx
coverage
**/.env
**/.env.*
!**/.env.example
.git
.github
*.md
```

- [ ] **4.2.6.8 — Write `apps/demo-cli/Dockerfile`.**

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.4.0

############################################
# Builder
############################################
FROM node:${NODE_VERSION}-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate
WORKDIR /workspace

# Copy lockfiles + manifests first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/demo-cli/package.json apps/demo-cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/adapter-ollama/package.json packages/adapter-ollama/package.json
COPY packages/adapter-openai-compatible/package.json packages/adapter-openai-compatible/package.json
COPY packages/adapter-anthropic/package.json packages/adapter-anthropic/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.base.json tsconfig.json nx.json ./
COPY packages packages
COPY apps/demo-cli apps/demo-cli

RUN pnpm exec nx run-many --target=build \
    --projects=core,adapter-ollama,adapter-openai-compatible,adapter-anthropic,demo-cli

# Prune dev dependencies for runtime
RUN pnpm install --frozen-lockfile --prod

############################################
# Runtime
############################################
FROM node:${NODE_VERSION}-alpine AS runtime

RUN apk add --no-cache tini

WORKDIR /app
USER node

COPY --from=builder --chown=node:node /workspace/apps/demo-cli/dist ./dist
COPY --from=builder --chown=node:node /workspace/apps/demo-cli/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/packages ./packages
COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
```

- [ ] **4.2.6.9 — Write `apps/demo-cli/docker-compose.yml`.**

```yaml
name: tierfall-demo

services:
  ollama:
    image: ollama/ollama:0.4.7
    container_name: tierfall-ollama
    ports:
      - '11434:11434'
    volumes:
      - ollama-models:/root/.ollama
    healthcheck:
      test: ['CMD', 'ollama', 'list']
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s
    restart: unless-stopped

  ollama-init:
    image: ollama/ollama:0.4.7
    container_name: tierfall-ollama-init
    depends_on:
      ollama:
        condition: service_healthy
    entrypoint: /bin/sh
    command: -c "OLLAMA_HOST=http://ollama:11434 ollama pull llama3.2:3b"
    restart: 'no'

  demo:
    build:
      context: ../..
      dockerfile: apps/demo-cli/Dockerfile
    container_name: tierfall-demo
    depends_on:
      ollama-init:
        condition: service_completed_successfully
    environment:
      OLLAMA_BASE_URL: http://ollama:11434
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}

  demo-cloud-only:
    profiles: ['cloud']
    build:
      context: ../..
      dockerfile: apps/demo-cli/Dockerfile
    container_name: tierfall-demo-cloud
    environment:
      OLLAMA_BASE_URL: ''
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}

volumes:
  ollama-models:
```

- [ ] **4.2.6.10 — Write `apps/demo-cli/CLAUDE.md`** (demo purpose, scenario architecture — content per spec §3.4).

- [ ] **4.2.6.11 — Write `apps/demo-cli/README.md`** (one-paragraph intro + `docker compose up` quickstart + `--profile cloud` note).

- [ ] **4.2.6.12 — Build the Docker image to verify the build pipeline.**

```bash
docker compose -f apps/demo-cli/docker-compose.yml build demo
```

Expected: clean build, final image tagged. Note size with `docker image ls`.

- [ ] **4.2.6.13 — Run a smoke test (boots Ollama + pulls model — slow on first run).**

```bash
docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo
```

Expected:

1. `ollama` becomes healthy
2. `ollama-init` pulls `llama3.2:3b`, exits 0
3. `demo` runs, prints the scaffolding message and exits 0

Tear down:

```bash
docker compose -f apps/demo-cli/docker-compose.yml down
```

Keep the `ollama-models` named volume — saves the model pull on subsequent runs.

- [ ] **4.2.6.14 — Update root `tsconfig.json` references.**

```json
{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/adapter-ollama" },
    { "path": "./packages/adapter-openai-compatible" },
    { "path": "./packages/adapter-anthropic" },
    { "path": "./apps/demo-cli" }
  ]
}
```

- [ ] **4.2.6.15 — Commit.**

```bash
git add apps/demo-cli eslint.config.mjs tsconfig.json
git commit -s -m "feat(demo): scaffold containerized demo with Ollama stack

- Multi-stage Alpine Dockerfile, non-root node user, pinned Node 24
- Compose: demo + ollama + ollama-init (pulls llama3.2:3b)
- --profile cloud opt-in for keyless cloud-tier demo
- Demo logs detected adapters and exits cleanly
- Real scenario logic = issue #9"
```

#### Commit 7 — `apps/docs` Fumadocs site

- [ ] **4.2.7.1 — Generate the Fumadocs scaffold.**

```bash
mkdir -p apps/docs
cd apps/docs
pnpm dlx create-fumadocs-app@latest . --src=false --useNpm=false --template=app
cd ../..
```

The CLI prompts may need answers — accept defaults except: package manager = pnpm, app router yes, src/ no, MDX yes.

- [ ] **4.2.7.2 — Adjust generated `apps/docs/package.json`.**

Rename to `@tierfall-app/docs`, add `"private": true`, ensure scripts include:

```json
"scripts": {
  "build": "next build",
  "dev": "next dev",
  "start": "next start",
  "lint": "next lint --max-warnings=0",
  "typecheck": "tsc --noEmit --pretty false"
}
```

- [ ] **4.2.7.3 — Add `apps/docs/project.json`** (same shape as `demo-cli`'s, with `"name": "docs"`).

- [ ] **4.2.7.4 — Replace generated `apps/docs/content/docs/index.mdx` with TierFall content.**

```mdx
---
title: TierFall
description: Local-first AI routing for TypeScript. Fall, never climb.
---

TierFall routes AI calls between four tiers — on-device, self-hosted edge, cheap cloud,
premium cloud — based on declarative policy. On failure, capability mismatch, or budget
breach, the router falls to a **cheaper** tier. It never climbs.

## Status

This is the v0.1 scaffold. Adapter implementations and full router logic land
via the v0.1 backlog issues; see the [project board](https://github.com/orgs/tierfall/projects).

## The four tiers

- **on-device** — runs in-process or on localhost (Ollama, llama.cpp)
- **self-hosted edge** — your own infrastructure (vLLM, LM Studio)
- **cheap cloud** — fast inference at low cost (Groq, DeepSeek, Cerebras)
- **premium cloud** — frontier models (Anthropic, OpenAI)

Full concept docs: see issue #10.
```

- [ ] **4.2.7.5 — Add a placeholder concepts page.**

`apps/docs/content/docs/concepts/tiers.mdx`:

```mdx
---
title: The four tiers
description: How TierFall classifies routing destinations.
---

> Full content for this page lands via issue #10. This stub keeps the navigation
> structure in place for v0.1 scaffold review.
```

`apps/docs/content/docs/concepts/meta.json`:

```json
{ "title": "Concepts", "pages": ["tiers"] }
```

- [ ] **4.2.7.6 — Write `apps/docs/CLAUDE.md`** (per spec §3.4).

- [ ] **4.2.7.7 — Write `apps/docs/README.md`** (Fumadocs dev quickstart).

- [ ] **4.2.7.8 — Build the docs site to verify.**

```bash
pnpm --filter @tierfall-app/docs build
```

Expected: clean Next.js build, `apps/docs/.next/` produced. If lint warnings appear (Next surfaces them as part of `next build`), fix them before committing — `--max-warnings=0` policy applies.

- [ ] **4.2.7.9 — Update root `tsconfig.json` references.**

Add `{ "path": "./apps/docs" }` to the references array.

- [ ] **4.2.7.10 — Commit.**

```bash
git add apps/docs tsconfig.json pnpm-lock.yaml
git commit -s -m "docs: scaffold Fumadocs site with v0.1 landing and concepts stub

- Next.js + Fumadocs 16
- Landing page describes the four tiers
- Concepts/tiers.mdx placeholder; full content = issue #10"
```

#### Commit 8 — GitHub Actions workflows

- [ ] **4.2.8.1 — Create `.github/workflows/` directory and write `ci.yml`.**

```yaml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  NODE_VERSION: '24.4.0'
  PNPM_VERSION: '10.10.0'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec eslint --max-warnings=0 .
      - run: pnpm exec prettier --check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec nx run-many --target=typecheck --parallel=3

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      # NOTE: at scaffold-close, the adapter and router/policy tests are intentionally
      # red (TDD). Until issues #2/#3/#5/#6/#8 land, this job is allowed to fail —
      # PR reviewers verify failures match the expected red tests.
      # ENFORCEMENT: the CI job uses `continue-on-error: true` ONLY on the scaffolding
      # PR's commit range; remove this immediately after merge. See issue #2 description.
      - run: pnpm exec nx run-many --target=test --parallel=3
        continue-on-error: true

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec nx run-many --target=build --parallel=3

  publint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-openai-compatible,adapter-anthropic
      - run: pnpm run publint

  attw:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-openai-compatible,adapter-anthropic
      - run: pnpm run attw

  knip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run knip
```

**Note on the `test` job's `continue-on-error: true`:** this is a transient compromise for the scaffolding PR because adapter tests are intentionally red. The kickoff prompt forbids `eslint-disable` / `@ts-ignore` but says nothing about `continue-on-error` — this is a CI-job-level escape hatch that must be **removed** as the first commit of the very first post-scaffolding PR (issue #2 description carries this as an acceptance criterion). Add a TODO comment in `ci.yml` that calls this out.

- [ ] **4.2.8.2 — Write `.github/workflows/release.yml`.**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  id-token: write

env:
  NODE_VERSION: '24.4.0'
  PNPM_VERSION: '10.10.0'

jobs:
  verify-origin:
    # Sanity guard: this workflow runs on push-to-main. Ensure the merge commit
    # came from a develop -> main PR. If anyone manually pushed to main
    # (which branch protection should prevent), abort.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 5 }
      - name: Verify previous PR head was develop
        run: |
          MERGED_PR=$(gh api "repos/${{ github.repository }}/commits/${{ github.sha }}/pulls" --jq '.[0]' )
          HEAD_REF=$(echo "$MERGED_PR" | jq -r .head.ref)
          if [ "$HEAD_REF" != "develop" ]; then
            echo "::error::Release workflow expects merges from develop only, got: $HEAD_REF"
            exit 1
          fi
        env:
          GH_TOKEN: ${{ github.token }}

  release:
    needs: verify-origin
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with:
          node-version: '${{ env.NODE_VERSION }}'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-openai-compatible,adapter-anthropic
      - id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm run changeset:publish
          version: pnpm run changeset:version
          commit: 'chore(release): version packages'
          title: 'chore(release): version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

`NPM_TOKEN` must be added to repo secrets before the first release — that's an organizational follow-up, not part of this PR. Document in `CONTRIBUTING.md` (Commit 10).

- [ ] **4.2.8.3 — Write `.github/workflows/codeql.yml`.**

```yaml
name: CodeQL

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]
  schedule:
    - cron: '0 6 * * 1' # Mondays 06:00 UTC

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      matrix:
        language: ['javascript-typescript']
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: '${{ matrix.language }}' }
      - uses: github/codeql-action/analyze@v3
        with: { category: '/language:${{ matrix.language }}' }
```

- [ ] **4.2.8.4 — Write `.github/workflows/dco.yml`.**

```yaml
name: DCO

on:
  pull_request:
    branches: [develop, main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Verify DCO sign-off on all commits
        run: |
          MERGE_BASE=$(git merge-base origin/${{ github.base_ref }} HEAD)
          COMMITS_WITHOUT_SIGNOFF=$(git log --format='%H %s' "$MERGE_BASE..HEAD" --invert-grep --grep='^Signed-off-by:' || true)
          if [ -n "$COMMITS_WITHOUT_SIGNOFF" ]; then
            echo "::error::The following commits are missing Signed-off-by:"
            echo "$COMMITS_WITHOUT_SIGNOFF"
            exit 1
          fi
```

- [ ] **4.2.8.5 — Write `.github/workflows/project-board.yml`.**

```yaml
name: Project Board

on:
  pull_request:
    types: [opened, ready_for_review, reopened, closed]

jobs:
  move-card:
    runs-on: ubuntu-latest
    steps:
      - name: Move card on PR open
        if: github.event.action == 'opened' || github.event.action == 'ready_for_review' || github.event.action == 'reopened'
        env:
          GH_TOKEN: ${{ secrets.PROJECT_BOARD_TOKEN }}
        run: |
          # Extract linked issue from PR body (Closes #N)
          ISSUE_NUM=$(echo '${{ github.event.pull_request.body }}' | grep -oE '[Cc]loses #[0-9]+' | head -1 | grep -oE '[0-9]+' || true)
          if [ -z "$ISSUE_NUM" ]; then echo "No linked issue; skipping board move."; exit 0; fi
          # Move via GraphQL — exact mutation depends on project field IDs (see scaffolding §4.1.12).
          # Concrete invocation is generated by tools/board-move.sh at runtime.
          echo "Would move issue #$ISSUE_NUM to In Review"

      - name: Move card on PR merge
        if: github.event.action == 'closed' && github.event.pull_request.merged == true
        env:
          GH_TOKEN: ${{ secrets.PROJECT_BOARD_TOKEN }}
        run: |
          ISSUE_NUM=$(echo '${{ github.event.pull_request.body }}' | grep -oE '[Cc]loses #[0-9]+' | head -1 | grep -oE '[0-9]+' || true)
          if [ -z "$ISSUE_NUM" ]; then echo "No linked issue; skipping board move."; exit 0; fi
          echo "Would move issue #$ISSUE_NUM to Done"
```

**Note:** the actual GraphQL mutations for ProjectV2 require field/option IDs fetched at runtime. Stub this with `echo` for the scaffolding PR; the **real** invocation is part of the post-scaffold board automation issue (added to backlog as issue #14b — a `prio:p2 chore`). For v0.1 the board can be moved manually if this stub fails to flip cards. Mark this as a known scaffold limitation in the PR description.

- [ ] **4.2.8.6 — Write `.github/workflows/refresh-agents-md.yml`.**

```yaml
name: Refresh AGENTS.md

on:
  schedule:
    - cron: '0 12 * * 0' # Sundays 12:00 UTC
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '10.10.0' }
      - uses: actions/setup-node@v4
        with: { node-version: '24.4.0', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm dlx gitnexus analyze
      - name: Open PR if diff
        uses: peter-evans/create-pull-request@v6
        with:
          commit-message: 'chore(docs): refresh AGENTS.md'
          title: 'chore(docs): refresh AGENTS.md'
          body: 'Automated refresh of AGENTS.md by the weekly gitnexus job.'
          branch: chore/refresh-agents-md
          base: develop
          delete-branch: true
          signoff: true
```

- [ ] **4.2.8.7 — Write issue templates and PR template.**

`.github/ISSUE_TEMPLATE/bug.yml`:

```yaml
name: Bug report
description: Report broken behavior
labels: ['type:bug']
body:
  - type: input
    id: package
    attributes: { label: 'Affected package', placeholder: '@tierfall/core' }
    validations: { required: true }
  - type: textarea
    id: repro
    attributes: { label: 'Reproduction', description: 'Minimal steps.' }
    validations: { required: true }
  - type: textarea
    id: expected
    attributes: { label: 'Expected vs actual' }
    validations: { required: true }
  - type: input
    id: versions
    attributes: { label: 'Versions (node, pnpm, @tierfall/*)', placeholder: 'node 24.4.0, ...' }
```

`.github/ISSUE_TEMPLATE/feature.yml`:

```yaml
name: Feature request
description: Propose new behavior
labels: ['type:feature', 'needs-design']
body:
  - type: textarea
    id: motivation
    attributes: { label: 'Why' }
    validations: { required: true }
  - type: textarea
    id: shape
    attributes: { label: 'Proposed shape (API sketch ok)' }
  - type: input
    id: milestone
    attributes: { label: 'Target milestone' }
```

`.github/ISSUE_TEMPLATE/adapter.yml`:

```yaml
name: New adapter proposal
description: Propose a new vendor adapter package
labels: ['type:feature', 'area:adapter', 'needs-design']
body:
  - type: input
    id: vendor
    attributes: { label: 'Vendor name' }
    validations: { required: true }
  - type: dropdown
    id: tier
    attributes:
      label: 'Default tier'
      options: ['on-device', 'self-hosted-edge', 'cheap-cloud', 'premium-cloud']
    validations: { required: true }
  - type: textarea
    id: api-shape
    attributes: { label: 'API shape — is this OpenAI-compatible, or distinct?' }
    validations: { required: true }
```

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What

<!-- One-sentence summary -->

## Why

<!-- Motivation, linked issue -->

Closes #

## How

<!-- High-level approach. Skip for trivial changes. -->

## Checklist

- [ ] Tests added (or updated to match new behavior)
- [ ] Docs updated (Fumadocs page or TSDoc)
- [ ] Changeset added if `packages/*` changed (`pnpm changeset`)
- [ ] `pnpm check` passes locally
- [ ] Commits signed off (`git commit -s`)
```

- [ ] **4.2.8.8 — Write `.github/CODEOWNERS`.**

```
# Default reviewer: maintainers team
* @tierfall/maintainers

# Critical paths: same team, explicit so review can't be bypassed by re-assignment
/packages/core/ @tierfall/maintainers
/eslint.config.mjs @tierfall/maintainers
/tsconfig.base.json @tierfall/maintainers
/.github/workflows/release.yml @tierfall/maintainers
```

The `@tierfall/maintainers` team must exist in the org — that's a one-time org setup outside this PR. If the team doesn't exist yet, this file is a no-op until it does.

- [ ] **4.2.8.9 — Write `.github/dependabot.yml`** (security-only — Renovate handles version bumps).

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
  - package-ecosystem: docker
    directory: /apps/demo-cli
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
```

- [ ] **4.2.8.10 — Commit.**

```bash
git add .github/
git commit -s -m "ci: GitHub Actions workflows + issue/PR templates + CODEOWNERS

- ci.yml: lint, typecheck, test, build, publint, attw, knip on every PR
- release.yml: main-only, verifies origin=develop, changesets publish
- codeql.yml: weekly + PR security analysis
- dco.yml: enforce Signed-off-by on every commit
- project-board.yml: stub for auto-move (real impl tracked separately)
- refresh-agents-md.yml: weekly gitnexus refresh
- Issue/PR templates, CODEOWNERS, Dependabot for actions+docker"
```

#### Commit 9 — Repo automation (changesets, renovate, knip, codecov, devcontainer, .claude/, scaffold script)

- [ ] **4.2.9.1 — Initialize changesets.**

```bash
pnpm exec changeset init
```

This creates `.changeset/config.json` and `.changeset/README.md`. Replace the generated `config.json` with:

```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "tierfall/tierfall" }],
  "commit": false,
  "fixed": [],
  "linked": [
    [
      "@tierfall/core",
      "@tierfall/adapter-ollama",
      "@tierfall/adapter-openai-compatible",
      "@tierfall/adapter-anthropic"
    ]
  ],
  "access": "public",
  "baseBranch": "develop",
  "updateInternalDependencies": "patch",
  "ignore": ["@tierfall-app/demo-cli", "@tierfall-app/docs"]
}
```

The `linked` block keeps all four published packages versioned in lockstep — simpler messaging at v0.x. Reconsider at v1.0 if independent versions become useful.

Also install the GitHub changelog renderer:

```bash
pnpm add -Dw @changesets/changelog-github
```

- [ ] **4.2.9.2 — Write `renovate.json`.**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":semanticCommits", "schedule:weekly"],
  "labels": ["type:chore", "area:ci"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "matchDepTypes": ["devDependencies"],
      "automerge": true,
      "automergeType": "branch"
    },
    {
      "matchPackagePatterns": ["^@tierfall/"],
      "enabled": false
    }
  ],
  "vulnerabilityAlerts": { "enabled": true, "labels": ["type:security"] },
  "lockFileMaintenance": { "enabled": true, "schedule": ["before 5am on Monday"] }
}
```

- [ ] **4.2.9.3 — Write `knip.json`.**

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "workspaces": {
    "packages/*": {
      "entry": ["src/index.ts!"],
      "project": ["src/**/*.ts!", "test/**/*.ts"]
    },
    "packages/adapter-openai-compatible": {
      "entry": ["src/index.ts!", "src/presets/index.ts!"],
      "project": ["src/**/*.ts!", "test/**/*.ts"]
    },
    "apps/demo-cli": {
      "entry": ["src/main.ts!"],
      "project": ["src/**/*.ts!"]
    },
    "apps/docs": {
      "entry": ["app/**/*.tsx!", "lib/**/*.ts!", "source.config.ts"],
      "project": ["**/*.{ts,tsx,mdx}!"]
    }
  },
  "ignore": ["**/dist/**", "**/.next/**", "**/coverage/**"]
}
```

- [ ] **4.2.9.4 — Write `codecov.yml`** (badge + diff, no gating).

```yaml
coverage:
  status:
    project:
      default:
        target: auto
        threshold: 100% # effectively no gating
        informational: true
    patch:
      default:
        informational: true
comment:
  layout: 'diff, files'
  require_changes: true
```

- [ ] **4.2.9.5 — Write `.devcontainer/devcontainer.json`.**

```jsonc
{
  "name": "TierFall dev",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:24",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
  },
  "postCreateCommand": "corepack enable && corepack prepare pnpm@10.10.0 --activate && pnpm install --frozen-lockfile",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "nrwl.angular-console",
        "unifiedjs.vscode-mdx",
      ],
    },
  },
  "remoteUser": "node",
}
```

- [ ] **4.2.9.6 — Write `.claude/settings.json`.**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "bash -c 'b=$(git -C \"${CLAUDE_PROJECT_DIR:-.}\" branch --show-current 2>/dev/null || echo unknown); p=$(pwd | sed \"s|.*tierfall/||\"); echo \"[branch: $b | path: $p]\"'"
      }
    ]
  },
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(git:status)",
      "Bash(git:diff)",
      "Bash(git:log:*)",
      "Bash(nx:*)",
      "Bash(gh:issue:*)",
      "Bash(gh:pr:*)",
      "Bash(gh:label:*)"
    ]
  }
}
```

- [ ] **4.2.9.7 — Write `.claude/commands/new-adapter.md`.**

```markdown
---
name: new-adapter
description: Scaffold a new TierFall adapter package
---

You will scaffold a new adapter package for TierFall at `packages/adapter-{{name}}`.

Run: `pnpm scaffold:adapter {{name}}`

Then ask the user the following before continuing:

1. What tier does this adapter default to? (on-device / self-hosted-edge / cheap-cloud / premium-cloud)
2. What API shape does this provider use? (OpenAI-compatible / Anthropic Messages / custom)
3. What's the default model recommendation for the README?

Once the user answers, edit the scaffolded files to reflect their answers, write a failing
TDD test for the basic completion path, and open a draft PR titled `feat(adapter-{{name}}): scaffold`
against `develop`. Link to the new adapter issue if one exists.

Do not implement the adapter logic in this command. That belongs in a follow-up task.
```

- [ ] **4.2.9.8 — Write `.claude/commands/check-vendor-neutrality.md`.**

```markdown
---
name: check-vendor-neutrality
description: Audit README, docs, and demo for vendor-neutrality violations
---

Run the following audit and report findings:

1. **README rotation:** grep root README + apps/docs/content/docs/\*_/_.mdx for each adapter
   name (Ollama, OpenAI, Anthropic, Groq, DeepSeek, Cerebras). Report counts. If any single
   vendor appears >2× the median, flag it.

2. **Adapter export symmetry:** for each `packages/adapter-*/src/index.ts`, list the exports.
   Adapters should expose the same shape (`*Adapter` class, `*AdapterConfig` interface). Flag
   asymmetries unless intentional (e.g., `presets` sub-export for openai-compatible).

3. **Hardcoded model strings:** grep `packages/**/src/**/*.ts` (excluding presets.ts) for
   string literals matching common model names. Report each occurrence — these should live in
   user config or in presets.ts, not in adapter implementations.

Output a markdown summary with sections per check, listing violations or "no findings".
```

- [ ] **4.2.9.9 — Write `.claude/commands/release-prep.md`.**

```markdown
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
```

- [ ] **4.2.9.10 — Write `.claudeignore`.**

```
node_modules
dist
coverage
.nx/cache
.nx/workspace-data
.next
.turbo
*.log
**/*.tsbuildinfo
apps/docs/.source
pnpm-lock.yaml
```

`.changeset/` is intentionally **not** ignored — Claude writes changesets.

- [ ] **4.2.9.11 — Write `tools/scaffold-adapter.ts`** (template-based scaffolder).

```ts
#!/usr/bin/env tsx
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: pnpm scaffold:adapter <name>  (lowercase, hyphens only)');
  process.exit(1);
}

const root = join(process.cwd(), 'packages', `adapter-${name}`);
if (existsSync(root)) {
  console.error(`packages/adapter-${name} already exists`);
  process.exit(1);
}

const Name = name
  .split('-')
  .map((s) => s[0]!.toUpperCase() + s.slice(1))
  .join('');

mkdirSync(join(root, 'src'), { recursive: true });
mkdirSync(join(root, 'test'), { recursive: true });

writeFileSync(
  join(root, 'package.json'),
  JSON.stringify(
    {
      name: `@tierfall/adapter-${name}`,
      version: '0.0.0',
      description: `TierFall ${Name} adapter`,
      license: 'Apache-2.0',
      type: 'module',
      main: './dist/index.cjs',
      module: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': {
          import: { types: './dist/index.d.ts', default: './dist/index.js' },
          require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
        },
      },
      files: ['dist', 'README.md', 'LICENSE'],
      scripts: {
        build: 'tsup',
        test: 'jest',
        lint: 'eslint --max-warnings=0 src test',
        typecheck: 'tsc --noEmit',
      },
      dependencies: { '@tierfall/core': 'workspace:*' },
    },
    null,
    2,
  ),
);

writeFileSync(
  join(root, 'src', 'index.ts'),
  `export { ${Name}Adapter, type ${Name}AdapterConfig } from './adapter.js';\n`,
);

writeFileSync(
  join(root, 'src', 'adapter.ts'),
  `import type { Adapter, AdapterCapability, LLMRequest, LLMResponse, Tier } from '@tierfall/core';

export interface ${Name}AdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
}

export class ${Name}Adapter implements Adapter {
  readonly name = '${name}';
  readonly tier: Tier = 'on-device';
  readonly capability: AdapterCapability = {
    contextWindowTokens: 8192,
    supportsTools: false,
    supportsStreaming: false,
    supportsStructuredOutput: false,
    costPerMillionInputTokens: null,
    costPerMillionOutputTokens: null,
  };

  constructor(private readonly config: ${Name}AdapterConfig) {}

  complete(_request: LLMRequest): Promise<LLMResponse> {
    return Promise.reject(new Error('${Name}Adapter.complete is not yet implemented'));
  }
}
`,
);

// Additional file writes — see canonical templates referenced below.
console.log(
  `Scaffolded packages/adapter-${name}. Next: edit tier, capability, README — and open issue/PR.`,
);
```

**The script writes seven additional files beyond the three shown above.** Each uses an inline template-string identical to the file authored in Commit 4 (`packages/core/`) or Commit 5 (`packages/adapter-ollama/`), with `${name}` / `${Name}` substituted in the obvious places:

| File the script writes | Canonical template source (copy verbatim, substitute name)                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.json`        | `packages/core/tsconfig.json` (Commit 4 task 4.2.4.3)                                                                                        |
| `tsup.config.ts`       | `packages/core/tsup.config.ts` (Commit 4 task 4.2.4.4)                                                                                       |
| `project.json`         | `packages/core/project.json` (Commit 4 task 4.2.4.5), with `"name": "adapter-${name}"`                                                       |
| `jest.config.js`       | `packages/core/jest.config.js` (Commit 4 task 4.2.4.13)                                                                                      |
| `CLAUDE.md`            | A minimal per-adapter CLAUDE.md describing the API shape it implements and pointing at the issue tracking its real implementation; ~30 lines |
| `README.md`            | One-paragraph intro + install + "implementation pending — see issue #N"                                                                      |
| `test/adapter.test.ts` | `packages/adapter-ollama/test/adapter.test.ts` (Commit 5 task 4.2.5.X.9), with `${Name}Adapter` substituted                                  |

The script is ~180 lines once these template strings are inlined. There are no decisions hidden in the template strings — they're literal copies of files committed earlier in the same scaffolding PR.

- [ ] **4.2.9.12 — Verify the scaffold script works.**

```bash
pnpm scaffold:adapter testdummy
```

Expected: `packages/adapter-testdummy/` created with full structure. Confirm with `ls`, then clean up:

```bash
rm -rf packages/adapter-testdummy
```

- [ ] **4.2.9.13 — Add a Husky `post-merge` hook that refreshes `docs/STRUCTURE.md` on pulls into develop.** (Optional — defer to Commit 10 if it crowds this commit.)

- [ ] **4.2.9.14 — Commit.**

```bash
git add .changeset renovate.json knip.json codecov.yml .devcontainer .claude .claudeignore tools/scaffold-adapter.ts package.json pnpm-lock.yaml
git commit -s -m "chore: repo automation — changesets, renovate, knip, codecov, devcontainer, .claude/

- changesets in linked mode (all published packages bump together at v0.x)
- renovate: weekly, automerge dev-dep patches
- knip: dead-code detection in CI
- codecov: badge + PR diff, no gating
- devcontainer: Node 24 + pnpm, one-click contributor setup
- .claude/commands: new-adapter, check-vendor-neutrality, release-prep
- UserPromptSubmit hook surfaces branch + path
- tools/scaffold-adapter.ts: template-based adapter generator"
```

#### Commit 10 — Top-level docs

- [ ] **4.2.10.1 — Rewrite root `README.md`** with the vendor-rotating example.

Content (full):

```markdown
# TierFall

> Local-first AI routing for TypeScript. **Fall, never climb.**

[![CI](https://github.com/tierfall/tierfall/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/tierfall/tierfall/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![codecov](https://codecov.io/gh/tierfall/tierfall/branch/develop/graph/badge.svg)](https://codecov.io/gh/tierfall/tierfall)

TierFall routes AI calls between four tiers — on-device, self-hosted edge, cheap cloud,
premium cloud — based on declarative policy. On failure, capability mismatch, or budget
breach, the router falls to a **cheaper** tier. Climbing toward premium is explicit,
observable, and never the default.

TierFall is designed to sit **underneath** frameworks like the Vercel AI SDK, not replace them.

## What works today

This is the **v0.1 scaffold** — repository structure, toolchain enforcement, CI, and demo
infrastructure are in place. Adapter implementations and full router/policy logic land via
the v0.1 backlog issues on the [project board](https://github.com/orgs/tierfall/projects).

See [docs.tierfall.dev](https://docs.tierfall.dev) for current status.

## Example (illustrative — implementation in progress)

\`\`\`ts
import { Router } from '@tierfall/core';
import { OllamaAdapter } from '@tierfall/adapter-ollama';
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';
import { AnthropicAdapter } from '@tierfall/adapter-anthropic';

const router = new Router([
new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-sonnet-4-7' }),
new OpenAICompatibleAdapter(presets.deepseek({ apiKey: process.env.DEEPSEEK_API_KEY! })),
new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama3.2:3b' }),
]);

const response = await router.complete({
messages: [{ role: 'user', content: 'Summarize the four-tier model.' }],
model: 'auto',
maxCostUSD: 0.05,
});

console.log(response.text);
console.log('Served by tier:', response.tier);
console.log('Fall chain:', response.fallChain);
\`\`\`

## Try the demo

\`\`\`bash
git clone https://github.com/tierfall/tierfall
cd tierfall
docker compose -f apps/demo-cli/docker-compose.yml up
\`\`\`

No API keys required — the demo runs against a containerized Ollama with `llama3.2:3b`.
Add keys via `cp apps/demo-cli/.env.example .env` to see cloud-tier scenarios.

## Roadmap

| Version | Scope                                     | Soft target |
| ------- | ----------------------------------------- | ----------- |
| v0.1    | Foundation: core + 3 adapters + Node demo | Q3 2026     |
| v0.2    | Browser: WebLLM + transformers.js         | Q4 2026     |
| v0.3    | React Native: llama.rn                    | Q1 2027     |
| v0.4    | Tool calls + structured output            | Q2 2027     |
| v0.5    | Response + semantic caching               | Q3 2027     |
| v1.0    | Vercel AI SDK compatibility shim          | Q4 2027     |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the canonical contribution rules.
Looking for a first issue? Filter by [good-first-issue](https://github.com/tierfall/tierfall/labels/good-first-issue).

## License

Apache-2.0
```

- [ ] **4.2.10.2 — Write root `CLAUDE.md`** (≤80 lines, high-level).

```markdown
# TierFall — root Claude context

Local-first AI routing for TypeScript. **Fall, never climb** — on failure / budget / capability
mismatch, the router moves to a _cheaper_ tier, never a more expensive one.

## Layout

\`\`\`
packages/
core/ # @tierfall/core — Adapter interface, Router, Policy, types
adapter-ollama/ # @tierfall/adapter-ollama
adapter-openai-compatible/ # @tierfall/adapter-openai-compatible + /presets
adapter-anthropic/ # @tierfall/adapter-anthropic
apps/
demo-cli/ # docker compose up — boots Ollama + demo
docs/ # Fumadocs site
docs/
STRUCTURE.md # canonical tree, auto-updated
superpowers/specs/ # design specs (frozen-in-time records)
superpowers/plans/ # implementation plans
\`\`\`

## Hard rules (canonical: CONTRIBUTING.md)

- No `any` outside test files.
- No `// eslint-disable*` / `// @ts-*` directives anywhere.
- No `git commit --no-verify`.
- Conventional Commits + DCO sign-off (`git commit -s`).
- Branch off `develop`, PR into `develop`. `develop → main` PRs are releases only.
- Tests RED until the issue tagged in the test message closes them. Don't change a test to pass.

## Branch model

`main` (stable, npm-publish source) ← `develop` (default integration) ← feature branches.

## Where to find things

- Architecture facts: `AGENTS.md` (gitnexus-generated, refreshed weekly).
- Per-package specifics: each `packages/*/CLAUDE.md` and `apps/*/CLAUDE.md`.
- Active issues: `gh issue list` or the project board.
- React Native exception: v0.3 ships as Expo, not Docker Compose. Don't suggest containerizing.
```

- [ ] **4.2.10.3 — Write `CONTRIBUTING.md`** — the canonical rule source. Required section outline, in order:
  1. **Welcome & status** — one paragraph: TierFall is v0.x, looking for first contributors, point at `good-first-issue` label.
  2. **Local setup** — `nvm use`, `corepack enable && corepack prepare pnpm@<PIN> --activate`, `pnpm install`, `pnpm run check`. Mention the devcontainer alternative.
  3. **Branch model** — two-branch (main + develop). All work branches off `develop`. Naming: `<type>/<short-description>` (e.g., `feat/adapter-groq`, `chore/upgrade-jest`). Never push directly to `develop` or `main`.
  4. **Commit discipline** — Conventional Commits (`feat:`, `fix:`, `chore:`, etc.), DCO sign-off required (`git commit -s`). Quote the hard rule: `git commit --no-verify` is a project policy violation, enforced socially + by CI re-running the same checks.
  5. **Code style** — strict TypeScript (no `any` outside test files), no `// eslint-disable*`, no `// @ts-*` comments. If TS complains: fix the type, narrow it, refactor, or introduce a typed abstraction — never suppress.
  6. **TDD expectation** — failing test before implementation. Adapter tests at scaffold-close are intentionally red; the issue assigned to each test makes it green.
  7. **Tests** — `pnpm test` runs all; `pnpm --filter @tierfall/core test` runs one package; integration tests against live Ollama use the demo's Compose stack.
  8. **Adding a new adapter** — `pnpm scaffold:adapter <name>` generates the package. Then open an issue (`type:feature`, `area:adapter`, `adapter:<name>`) and PR against `develop`. The vendor-neutrality check applies — see `.claude/commands/check-vendor-neutrality.md` for what reviewers will look for.
  9. **Changesets** — every PR touching `packages/*` needs `pnpm changeset` (a Husky hook will warn if missing). Pick `patch` / `minor` / `major` per semver; v0.x is all `patch`/`minor` until v1.0.
  10. **PR process** — link an issue with `Closes #N`. The project board auto-moves your card to `In Review` on open, `Done` on merge. Reviews required; CI must be green.
  11. **Release process** — only maintainers; release PR is titled `release: vX.Y.Z`, merges `develop → main`, triggers `release.yml` which runs `pnpm changeset publish`. Tags are created from `main` post-merge.
  12. **Code of Conduct** — pointer to `CODE_OF_CONDUCT.md`.
  13. **License** — Apache-2.0; by submitting a contribution under DCO sign-off you agree to license it under the same terms.

  Length target: 200-300 lines total. Style: present tense, terse, link freely. No emoji.

- [ ] **4.2.10.4 — Write `CODE_OF_CONDUCT.md`** — full text of Contributor Covenant 2.1 from `https://www.contributor-covenant.org/version/2/1/code_of_conduct/`, with contact email `conduct@tierfall.dev`.

- [ ] **4.2.10.5 — Write `CHANGELOG.md`.**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

This project uses [changesets](https://github.com/changesets/changesets) for versioning;
this file is auto-updated by `pnpm changeset version`.

## Unreleased

_Scaffolding only. Feature work tracked in the v0.1 backlog._
```

- [ ] **4.2.10.6 — Write `SECURITY.md`.**

```markdown
# Security Policy

## Reporting a vulnerability

Email `security@tierfall.dev` with a description and reproduction. We aim to acknowledge
within 48 hours.

Do **not** open public issues for vulnerabilities.

## Supported versions

The latest minor release of `@tierfall/core` and the official adapter packages is supported.
v0.x lines may not receive backports.
```

- [ ] **4.2.10.7 — Write `docs/STRUCTURE.md`** — generated from the file inventory in §3 of this plan; each directory gets a one-line description. The Husky `post-merge` hook (set up in Commit 9 or this commit, executor's choice) will refresh it on `develop` updates.

- [ ] **4.2.10.8 — Write root `.env.example`** — symlink-equivalent or a near-copy of `apps/demo-cli/.env.example` for convenience when running tests at the root.

- [ ] **4.2.10.9 — Add the brainstorm spec + this plan to git** (they were written before §4.1 but never staged; they live in `docs/superpowers/` and should land in this commit).

```bash
git add docs/superpowers/
```

- [ ] **4.2.10.10 — Final verification before committing.**

```bash
pnpm run check
```

This runs lint + typecheck + test + build across all projects. Expected:

- lint ✅
- typecheck ✅
- test ❌ (adapter and router/policy tests intentionally red — count and verify they're the expected red tests)
- build ✅

If lint/typecheck/build fail, fix and re-run. Adapter test failures are expected.

- [ ] **4.2.10.11 — Commit.**

```bash
git add README.md CLAUDE.md CONTRIBUTING.md CODE_OF_CONDUCT.md CHANGELOG.md SECURITY.md \
        docs/STRUCTURE.md docs/superpowers/ .env.example
git commit -s -m "docs: top-level documentation and governance files

- README with vendor-rotating example and roadmap table
- Root CLAUDE.md (high-level only, points to per-package files)
- CONTRIBUTING.md as canonical rule source
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1)
- SECURITY.md
- CHANGELOG.md stub managed by changesets
- docs/STRUCTURE.md canonical tree
- Brainstorm spec + this implementation plan committed under docs/superpowers/"
```

### 4.3 — Open PR, verify CI green, merge

- [ ] **4.3.1 — Push the branch.**

```bash
git push -u origin chore/initial-scaffolding
```

- [ ] **4.3.2 — Verify commit count.**

```bash
git log --oneline develop..chore/initial-scaffolding | wc -l
```

Expected: ~10 (within the 8–12 target). If higher, look for follow-up "fix lint" or "fix prettier" commits — those are kickoff-prompt violations. Either rebase to squash them in _or_ if a Commit 3 hardening commit happened (legitimate per §4.2 / Commit 3), accept 11 commits.

- [ ] **4.3.3 — Open the pull request.**

````bash
gh pr create \
  --base develop \
  --head chore/initial-scaffolding \
  --title "chore: initial repository scaffolding" \
  --body-file - <<'BODY'
## Summary

Bootstraps the TierFall monorepo per:
- Spec: `docs/superpowers/specs/2026-05-20-tierfall-bootstrap-design.md`
- Plan: `docs/superpowers/plans/2026-05-20-tierfall-bootstrap.md`

Closes #1.

## Highlights

- Nx + pnpm workspace, strict ESLint flat config + tsconfig (no `any`, no eslint-disable, no @ts-*)
- Three adapter packages scaffolded with red TDD tests (turn green via issues #5, #6, #7, #8)
- Containerized demo: `docker compose -f apps/demo-cli/docker-compose.yml up`
- Fumadocs site scaffolded
- CI: lint, typecheck, test, build, publint, attw, knip, CodeQL
- Release flow: `develop → main` PR-only, npm publish via changesets
- DCO enforced; Renovate configured; Codecov informational only

## Verification of toolchain constraints

| Constraint | Verified by |
|---|---|
| No `any` outside tests | Attempted commit blocked by `@typescript-eslint/no-explicit-any` |
| No `// eslint-disable*` | Attempted commit blocked by `@eslint-community/eslint-comments` |
| No `// @ts-*` | Attempted commit blocked by `@typescript-eslint/ban-ts-comment` |
| `--no-verify` defense-in-depth | Local bypass succeeds (Git can't be made to refuse it); CI re-runs same checks |
| `@tierfall/core` vendor-neutral | `pnpm why` shows no vendor SDK deps in core |

## Known scaffold limitations (filed as follow-up issues)

- Adapter `test` jobs are intentionally red (red TDD). `ci.yml` uses `continue-on-error: true` on the `test` job for this PR only. **Removed** as the first commit of issue #2's PR.
- `project-board.yml` GraphQL stub: cards may need manual move until automation lands.
- `@tierfall/maintainers` GitHub team must be created out-of-band for CODEOWNERS to engage.

## How to validate locally

```bash
pnpm install
pnpm run check                                                 # lint+typecheck+build pass; some tests intentionally red
docker compose -f apps/demo-cli/docker-compose.yml up          # boots Ollama + demo
pnpm --filter @tierfall-app/docs build                         # builds docs site
````

BODY

````

Record the PR URL.

- [ ] **4.3.4 — Wait for CI.**

```bash
gh pr checks --watch
````

Expected: all required checks green (lint, typecheck, build, publint, attw, knip, CodeQL, DCO). The `test` job will report success because of the scoped `continue-on-error: true` — verify the _output_ of the test job lists exactly the expected red tests (the three router/policy ones in core + one per adapter + one for openai-compatible presets = 7 red tests total).

If anything unexpected is red, **stop**. Investigate. Fix via a new commit on the branch, don't amend.

- [ ] **4.3.5 — Verify the project board card moved (or do it manually).**

```bash
# Inspect the project; the issue #1 card should be in In Review
```

If `project-board.yml` didn't move it (the stub is non-functional), use the field-ID dance from §4.1.12 to set #1's status to "In Review".

- [ ] **4.3.6 — Request review** (per branch protection on `develop`).

If this is a solo project at this point, the user (repo owner) reviews their own PR via the `@tierfall/maintainers` team grant, OR temporarily relaxes branch protection's "require 1 approval" rule on `develop` for the bootstrap PR only, then restores it post-merge.

If relaxing: document in the PR comment, restore immediately on merge.

- [ ] **4.3.7 — Merge the PR.**

Use a merge commit (preserves the per-commit history, which is the readable narrative the scaffolding produces):

```bash
gh pr merge --merge --delete-branch
```

The board card for issue #1 should auto-move to Done (or do it manually if the stub doesn't fire).

### 4.4 — Post-merge: gitnexus analyze docs PR

- [ ] **4.4.1 — Pull `develop` locally.**

```bash
git checkout develop
git pull --ff-only origin develop
```

- [ ] **4.4.2 — Create branch for gitnexus output.**

```bash
git checkout -b docs/gitnexus-initial
```

- [ ] **4.4.3 — Run gitnexus analyze.**

```bash
pnpm dlx gitnexus analyze
```

Expected output: `AGENTS.md` written/updated at repo root. If `gitnexus` is not yet installed on the box, install it first per its npm page; if not findable on npm under that name, fall back to whatever the official package name is — the kickoff prompt mentions GitNexus as an existing MCP tool, so consult its docs.

- [ ] **4.4.4 — Run gitnexus skill generation.**

```bash
pnpm dlx gitnexus analyze --skills
```

Expected: `.claude/skills/` populated with repo-specific skill files.

- [ ] **4.4.5 — Verify the output is sensible.**

Inspect `AGENTS.md`: it should describe the four packages, two apps, and core invariants. If it's garbage, **do not commit** — file a follow-up issue against gitnexus instead, and proceed with a hand-written `AGENTS.md` stub.

- [ ] **4.4.6 — Commit.**

```bash
git add AGENTS.md .claude/skills/
git commit -s -m "docs: initial gitnexus analyze output

- AGENTS.md: gitnexus-generated architecture truth
- .claude/skills/: repo-specific skills for new-adapter, router work, etc.

Refreshed weekly by .github/workflows/refresh-agents-md.yml."
```

- [ ] **4.4.7 — Push and open PR.**

```bash
git push -u origin docs/gitnexus-initial
gh pr create --base develop --head docs/gitnexus-initial \
  --title "docs: initial gitnexus AGENTS.md + skills" \
  --body "Closes whatever issue tracks this — likely a follow-up created at PR time, e.g. issue #16."
```

This docs PR may not have an existing issue. Either create one beforehand (`gh issue create --title "docs: commit initial gitnexus output" --label "type:docs,area:meta"` and reference it in the PR body), or accept this as an exception-from-issue PR with the rationale "tracks an automation output, not a feature."

- [ ] **4.4.8 — Verify CI green, merge.**

```bash
gh pr checks --watch
gh pr merge --merge --delete-branch
```

### 4.5 — Summary handoff

After §4.4 merges, produce the summary message the kickoff prompt asks for. Format:

```
Phase 3 complete.

Repo:                  https://github.com/tierfall/tierfall
Project board:         https://github.com/orgs/tierfall/projects/<N>
Scaffolding PR:        https://github.com/tierfall/tierfall/pull/1
Scaffolding CI run:    https://github.com/tierfall/tierfall/actions/runs/<id>
gitnexus PR:           https://github.com/tierfall/tierfall/pull/<n>
Docs site:             https://docs.tierfall.dev (or local: cd apps/docs && pnpm dev)
Demo entry point:      docker compose -f apps/demo-cli/docker-compose.yml up
GitNexus index:        AGENTS.md + .claude/skills/ committed
develop branch URL:    https://github.com/tierfall/tierfall/tree/develop  (protected)
main branch URL:       https://github.com/tierfall/tierfall/tree/main      (protected, releases only)

v0.1 backlog: 15 issues, 4 good-first-issue. Pick from `Ready` column to continue.

Known scaffold debt to clear in the next PR:
- Remove `continue-on-error: true` from ci.yml `test` job (issue #2's first commit)
- Land real GraphQL board automation (issue #14b — chore created at scaffold time)
- Ensure `@tierfall/maintainers` GitHub team is created if not already
```

---

## 5. v0.1 backlog (15 issues created during §4.1.13)

All issues use `--milestone "v0.1.0 — Foundation"`. Status column on board = `Backlog` at creation (except #1 which is `In Progress` during scaffolding). Labels per the §4.1.9 taxonomy.

### Issue #2 — `feat(core): implement Router fall-never-climb state machine`

**Labels:** `area:core`, `type:feature`, `prio:p0`, `platform:node`

**Body:**

Implement the real `Router.complete` logic in `packages/core/src/router.ts`. The scaffolded skeleton currently throws "not implemented".

**Acceptance criteria:**

- [ ] Given an ordered adapter list `[premium, cheap, on-device]`, request flowing successfully through premium returns its response with `tier: 'premium-cloud'` and `fallChain: []`.
- [ ] When the first adapter throws `ProviderUnavailableError`, the router calls the next adapter; the response's `fallChain` includes one diagnostic with `reason: 'provider-unavailable'`.
- [ ] When the first adapter throws `BudgetExceededError`, fall to the next adapter; `fallChain` includes `reason: 'budget'`.
- [ ] When the first adapter throws `CapabilityMismatchError`, fall to the next adapter; `fallChain` includes `reason: 'capability'`.
- [ ] When ALL adapters fail, throw `NoTierAvailableError` carrying the full fallChain.
- [ ] Climbing (calling a _lower-index_ adapter than the previous attempt) is impossible by construction.
- [ ] The existing red test in `packages/core/test/router.test.ts` passes; add ≥3 more tests covering each fall reason and the no-tier-available case.
- [ ] **First commit of this PR removes `continue-on-error: true` from `.github/workflows/ci.yml`'s `test` job.** (Scaffold debt; explicit acceptance criterion.)
- [ ] TSDoc on every exported symbol per constraint #15.
- [ ] Changeset added (`pnpm changeset`).

### Issue #3 — `feat(core): implement declarative Policy evaluator`

**Labels:** `area:core`, `type:feature`, `prio:p0`, `platform:node`

**Body:**

Implement `DefaultPolicy.evaluate` in `packages/core/src/policy.ts`. The evaluator takes an `LLMRequest` + `Adapter[]` and returns the ordered adapter list the Router will attempt.

**Acceptance criteria:**

- [ ] Without `request.requires`, returns adapters sorted by tier-index (premium-cloud first → on-device last).
- [ ] When `request.requires.minContextWindowTokens` is set, excludes adapters whose `capability.contextWindowTokens` is below.
- [ ] When `request.requires.tools` is `true`, excludes adapters where `capability.supportsTools` is `false`.
- [ ] Same for `streaming` and `structuredOutput`.
- [ ] When `request.maxCostUSD` is set, excludes adapters whose **lowest possible cost** for the request would exceed the cap (assume avg 500 input + 500 output tokens for the estimate).
- [ ] The existing red test in `packages/core/test/policy.test.ts` passes; add ≥4 more tests covering each filter.
- [ ] TSDoc on every exported symbol.
- [ ] Changeset added.

### Issue #4 — `feat(core): error taxonomy + FallDiagnostic helper`

**Labels:** `area:core`, `type:feature`, `prio:p1`, `platform:node`

**Body:**

The scaffolded `errors.ts` defines the four error classes. This issue adds:

- A `FallDiagnostic.format()` helper that returns a human-readable description of a fall chain
- TSDoc examples on each error class showing when adapters should throw which

**Acceptance criteria:**

- [ ] `formatFallChain(chain: readonly FallDiagnostic[]): string` returns a multi-line table-like string suitable for demo logging.
- [ ] Each error class has a TSDoc `@example` block.
- [ ] Tests cover formatting an empty chain, a single-fall chain, and a 3-deep chain.
- [ ] Changeset added.

### Issue #5 — `feat(adapter-ollama): implement complete() against Ollama /api/chat`

**Labels:** `area:adapter`, `adapter:ollama`, `type:feature`, `prio:p1`, `platform:node`

**Body:**

Implement `OllamaAdapter.complete` to POST to `{baseUrl}/api/chat` and translate the response into `LLMResponse`.

**Acceptance criteria:**

- [ ] Basic non-streaming completion succeeds against a live Ollama instance.
- [ ] Maps Ollama errors to `ProviderUnavailableError` (network / 4xx / 5xx).
- [ ] If `request.requires.tools === true`, throws `CapabilityMismatchError` (Ollama tool calling lands in v0.4).
- [ ] Default `capability` reflects the reality of `llama3.2:3b` (8192 tokens, no tools, no structured, free).
- [ ] Existing red test passes; add ≥3 integration tests against a real Ollama (run in CI via the demo's Compose service).
- [ ] CLAUDE.md updated with the known gotchas you found.
- [ ] Changeset added.

### Issue #6 — `feat(adapter-openai-compatible): implement complete() against /v1/chat/completions`

**Labels:** `area:adapter`, `adapter:openai-compatible`, `type:feature`, `prio:p1`, `platform:node`

**Body:**

Implement `OpenAICompatibleAdapter.complete` against the OpenAI Chat Completions API shape.

**Acceptance criteria:**

- [ ] Basic non-streaming completion succeeds against a live OpenAI-compatible endpoint (use a mock server in unit tests; integration tests gated on `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` env).
- [ ] Maps OpenAI errors to `ProviderUnavailableError` (network / 4xx / 5xx other than rate limit) or `BudgetExceededError` (rate limit / quota error).
- [ ] Usage extracted from `response.usage`; cost computed using `capability.costPerMillion*Tokens`.
- [ ] Existing red test passes; add ≥3 tests covering happy path, network error, and quota error.
- [ ] Changeset added.

### Issue #7 — `feat(adapter-openai-compatible): ship /presets sub-export`

**Labels:** `area:adapter`, `adapter:openai-compatible`, `type:feature`, `prio:p2`, `platform:node`

**Body:**

Implement the five presets stubbed in `packages/adapter-openai-compatible/src/presets.ts`: `groq`, `deepseek`, `openai`, `cerebras`, `openrouter`.

**Acceptance criteria:**

- [ ] Each preset returns a valid `OpenAICompatibleAdapterConfig` with vendor-correct `baseUrl` and a sensible default `model`.
- [ ] Each preset accepts `overrides` and merges them (override wins).
- [ ] Each preset sets sensible `capability` defaults (cost figures from vendor pricing pages — cite source in TSDoc).
- [ ] Existing red test in `packages/adapter-openai-compatible/test/presets.test.ts` passes; add one test per preset.
- [ ] `@tierfall/adapter-openai-compatible/presets` resolves correctly in ESM and CJS (verified by `attw`).
- [ ] Changeset added.

### Issue #8 — `feat(adapter-anthropic): implement complete() against Messages API`

**Labels:** `area:adapter`, `adapter:anthropic`, `type:feature`, `prio:p1`, `platform:node`

**Body:**

Implement `AnthropicAdapter.complete` against Anthropic's Messages API (POST `/v1/messages`).

**Acceptance criteria:**

- [ ] Handles Anthropic's distinct message shape (system as top-level field, not a message; content as blocks not flat string).
- [ ] Maps Anthropic errors to the standard `ProviderUnavailableError` / `BudgetExceededError`.
- [ ] Default `capability` matches `claude-sonnet-4-7` published characteristics (200K context, tools, streaming, structured output, current pricing).
- [ ] Existing red test passes; add ≥3 tests covering happy path, message-shape translation, and error mapping.
- [ ] CLAUDE.md updated with translation gotchas vs OpenAI.
- [ ] Changeset added.

### Issue #9 — `feat(demo): implement four scenarios (basic, budget fall, capability mismatch, provider down)`

**Labels:** `area:demo`, `type:feature`, `prio:p1`, `platform:node`

**Body:**

Replace the demo stub in `apps/demo-cli/src/main.ts` with four scenarios per the spec §3.6.

**Acceptance criteria:**

- [ ] **Scenario 1 (basic chat):** runs against the highest-priority available adapter, prints `text`, `tier`, and an empty `fallChain`.
- [ ] **Scenario 2 (budget fall):** configures premium with a `maxCostUSD: 0.001` cap that no real request can meet; verifies the router falls to cheap → on-device; prints the fall chain.
- [ ] **Scenario 3 (capability mismatch):** sends a request with `requires.tools: true` against a setup where only Ollama is available; verifies the router throws `NoTierAvailableError` and prints the diagnostic chain.
- [ ] **Scenario 4 (provider down):** monkey-patches one adapter to throw `ProviderUnavailableError`; verifies the router falls past it.
- [ ] Each scenario prints clearly: expected outcome, what happened, full fall chain.
- [ ] Missing-API-key adapters are skipped with `[tierfall] X adapter skipped — Y_API_KEY not set` per spec §3.6.
- [ ] `docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo` runs all four scenarios end-to-end against the Compose Ollama.
- [ ] No changeset (apps are not published).

### Issue #10 — `docs: write Fumadocs v0.1 content (getting started, tiers, router, adapter reference)`

**Labels:** `area:docs`, `type:docs`, `prio:p1`

**Body:**

Replace the Fumadocs scaffold placeholders with real v0.1 content.

**Acceptance criteria:**

- [ ] `content/docs/index.mdx` — TierFall pitch, current status, install snippet.
- [ ] `content/docs/getting-started.mdx` — local install, demo, first request.
- [ ] `content/docs/concepts/tiers.mdx` — the four tiers, with examples.
- [ ] `content/docs/concepts/fall-never-climb.mdx` — the routing thesis, what counts as fall vs climb.
- [ ] `content/docs/concepts/policy.mdx` — policy DSL, fields and meaning.
- [ ] `content/docs/reference/adapter.mdx` — `Adapter` interface contract for adapter authors.
- [ ] `content/docs/reference/adapter-ollama.mdx`, `adapter-openai-compatible.mdx`, `adapter-anthropic.mdx` — per-adapter install + config + defaults.
- [ ] `content/docs/recipes/budget-aware-routing.mdx` — example showing budget fall.
- [ ] Site builds via `pnpm --filter @tierfall-app/docs build` with zero warnings.

### Issue #11 — `chore: add prettier-plugin-organize-imports` 🟢 good-first-issue

**Labels:** `area:ci`, `type:chore`, `prio:p2`, `good-first-issue`

**Body:**

Add the [`prettier-plugin-organize-imports`](https://github.com/simonhaenisch/prettier-plugin-organize-imports) plugin to sort and dedupe TypeScript imports on `prettier --write`.

**Acceptance criteria:**

- [ ] `prettier-plugin-organize-imports` added as a devDep at the workspace root.
- [ ] `.prettierrc` updated to reference the plugin.
- [ ] Run `pnpm format` and commit any resulting import reordering in a separate commit (so the plugin change is reviewable independently).
- [ ] `pnpm exec prettier --check .` continues to pass on CI.
- [ ] No changeset (tooling change, no package impact).

**Help:** `prettier-plugin-organize-imports` reads its config from each TS file's nearest tsconfig. No additional flags needed.

### Issue #12 — `docs: TSDoc examples on every export from @tierfall/core` 🟢 good-first-issue

**Labels:** `area:core`, `type:docs`, `prio:p2`, `good-first-issue`

**Body:**

Add a TSDoc `@example` block to every exported symbol in `packages/core/src/index.ts`.

**Acceptance criteria:**

- [ ] Every `export type`, `export class`, `export interface`, and `export const` has a TSDoc block with `@example`.
- [ ] Examples are runnable (the doc-extractor tool, see below, validates them).
- [ ] Add a CI step that runs [`@microsoft/api-extractor`](https://api-extractor.com/) or equivalent to verify TSDoc is well-formed. (If extracting is too heavy for v0.1, skip — but every symbol must still have an example.)
- [ ] No changeset.

**Help:** Look at how `@vercel/ai` writes its public TSDoc for examples of tone and depth.

### Issue #13 — `docs: README "rotate model across three adapters" example` 🟢 good-first-issue

**Labels:** `area:meta`, `type:docs`, `prio:p2`, `good-first-issue`

**Body:**

The root README currently shows one example that uses Anthropic + DeepSeek + Ollama. Expand the README to include a section that rotates a _single message_ across _all three adapters individually_, showing the response from each — to make vendor neutrality visible at a glance.

**Acceptance criteria:**

- [ ] New "Rotate across adapters" section in README, between "Example" and "Try the demo".
- [ ] Code snippet imports all three adapters and runs the same `LLMRequest` against each separately (no Router involved — that's the point).
- [ ] Comment in the snippet states: "TierFall has no preferred vendor — these are equivalent."
- [ ] `.claude/commands/check-vendor-neutrality.md`'s README check passes against the updated text.

**Help:** Don't introduce a Router here — that confuses the point. Each adapter's `complete()` is called directly.

### Issue #14 — `docs: Fumadocs page "Why fall, never climb?"` 🟢 good-first-issue

**Labels:** `area:docs`, `type:docs`, `prio:p2`, `good-first-issue`

**Body:**

Write a Fumadocs page articulating the routing thesis: why falling toward cheaper is the safe default, why climbing requires explicit opt-in, what happens in the corner cases.

**Acceptance criteria:**

- [ ] New file `apps/docs/content/docs/concepts/why-fall-never-climb.mdx`.
- [ ] Page covers: the failure modes of "climbing" routers (runaway cost, latency, capability ratchet), why "falling" composes with budgets, and the observable-by-default property of TierFall's fall chains.
- [ ] Two diagrams (Fumadocs supports Mermaid): one showing a fall sequence, one showing why climbing requires explicit policy.
- [ ] Linked from the docs sidebar in `content/docs/concepts/meta.json`.

**Help:** Keep the tone explanatory not promotional. Concrete failure modes > marketing copy.

### Issue #15 — `test(core): integration test exercising tier fall with mocked adapters`

**Labels:** `area:core`, `type:test`, `prio:p1`, `platform:node`

**Body:**

After issues #2 and #3 land, write a dedicated integration test that exercises the full router+policy interplay with mocked adapters — to catch regressions when adapter implementations evolve.

**Acceptance criteria:**

- [ ] `packages/core/test/integration.test.ts` simulates a 3-adapter setup (premium / cheap / local) with all four error paths.
- [ ] Test asserts both the final `LLMResponse.tier` AND the full `fallChain` structure.
- [ ] Test runs in <1s with no network.
- [ ] Test does NOT mock `Router` or `DefaultPolicy` — only the adapters. Real router + policy logic under test.

### Issue #16 — `chore(ci): land real GraphQL project-board automation` _(scaffold debt — added at PR time)_

**Labels:** `area:ci`, `type:chore`, `prio:p2`, `platform:node`

**Body:**

The scaffolding's `.github/workflows/project-board.yml` is a stub that `echo`s what it would do. Implement the real GraphQL ProjectV2 mutations to move cards on PR open (→ In Review) and merge (→ Done).

**Acceptance criteria:**

- [ ] Workflow uses a fine-scoped `PROJECT_BOARD_TOKEN` secret with `project:write` permission.
- [ ] PR open + ready_for_review + reopened → linked issue's Status → "In Review".
- [ ] PR merged → linked issue's Status → "Done".
- [ ] PR closed without merge → linked issue's Status → "Backlog".
- [ ] No-op gracefully when PR body has no `Closes #N` (e.g., the gitnexus refresh PR).
- [ ] Test by opening + closing a draft PR against `develop` and watching the board.

### Backlog summary

| #   | Title                                  | Labels                                                         | Good-first |
| --- | -------------------------------------- | -------------------------------------------------------------- | ---------- |
| 1   | Initial repository scaffolding         | type:chore, area:meta, prio:p0, area:ci                        | —          |
| 2   | Router fall-never-climb state machine  | area:core, type:feature, prio:p0                               | —          |
| 3   | DefaultPolicy evaluator                | area:core, type:feature, prio:p0                               | —          |
| 4   | Error taxonomy + FallDiagnostic helper | area:core, type:feature, prio:p1                               | —          |
| 5   | adapter-ollama.complete                | area:adapter, adapter:ollama, type:feature, prio:p1            | —          |
| 6   | adapter-openai-compatible.complete     | area:adapter, adapter:openai-compatible, type:feature, prio:p1 | —          |
| 7   | adapter-openai-compatible /presets     | area:adapter, adapter:openai-compatible, type:feature, prio:p2 | —          |
| 8   | adapter-anthropic.complete             | area:adapter, adapter:anthropic, type:feature, prio:p1         | —          |
| 9   | Demo: four scenarios                   | area:demo, type:feature, prio:p1                               | —          |
| 10  | Fumadocs v0.1 content                  | area:docs, type:docs, prio:p1                                  | —          |
| 11  | prettier-plugin-organize-imports       | area:ci, type:chore, prio:p2                                   | 🟢         |
| 12  | TSDoc examples on @tierfall/core       | area:core, type:docs, prio:p2                                  | 🟢         |
| 13  | README rotate-across-adapters example  | area:meta, type:docs, prio:p2                                  | 🟢         |
| 14  | Fumadocs "Why fall, never climb?"      | area:docs, type:docs, prio:p2                                  | 🟢         |
| 15  | Core integration test                  | area:core, type:test, prio:p1                                  | —          |
| 16  | Real project-board GraphQL automation  | area:ci, type:chore, prio:p2                                   | —          |

**Total:** 16 issues including scaffolding. v0.1 work items (post-scaffold): 15. Good-first-issues: 4.

Acceptance: the kickoff asked for 12–15 issues with ≥3 good-first-issue. The plan ships 15 post-scaffold issues with 4 good-first-issue. The 16th (`#16`) is scaffold debt that exists because the scaffolding ships an honest stub rather than a half-baked board automation.
