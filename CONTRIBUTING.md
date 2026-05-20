# Contributing to TierFall

Welcome. TierFall is a v0.x indie project actively looking for first contributors. This file is the canonical source of contribution rules — everything else (root `CLAUDE.md`, per-package `CLAUDE.md`, PR templates) points back here.

If you're new, filter issues by [`good-first-issue`](https://github.com/tierfall/tierfall/labels/good-first-issue). Those are scoped to land in one short PR with a clear acceptance checklist.

## Local setup

You need:

- **Node 24.x LTS** — `nvm use` (an `.nvmrc` pins the exact patch)
- **pnpm 10.x** via Corepack — `corepack enable && corepack prepare pnpm@10.33.0 --activate`
- **Docker** + Docker Compose v2 — for the demo and CI integration tests
- **Git** with a configured `user.name` and `user.email` (DCO sign-off requires both)

Then:

```bash
git clone git@github.com:tierfall/tierfall.git
cd tierfall
pnpm install
pnpm run check                           # lint + typecheck + test + build, in parallel
```

A devcontainer is provided (`.devcontainer/devcontainer.json`) if you prefer one-click setup in VS Code.

## Branch model

Two long-lived branches:

- **`main`** — stable, npm-publish source. Only `develop → main` release PRs land here.
- **`develop`** — GitHub default branch; integration line for feature work.

All work branches off `develop` using a `<type>/<short-description>` name:

```
feat/adapter-groq
fix/ollama-timeout-handling
chore/upgrade-jest
docs/policy-rfc
```

You PR into `develop`. Never push directly to `develop` or `main` after the initial bootstrap.

## Commit discipline

Every commit is **Conventional Commits** + **DCO sign-off**. Examples:

```
feat(core): emit FallDiagnostic when budget caps trigger fall

Signed-off-by: Your Name <you@example.com>
```

```
fix(adapter-ollama): map ECONNREFUSED to ProviderUnavailableError

Signed-off-by: Your Name <you@example.com>
```

To sign off automatically: `git commit -s -m "..."`. Without `-s` the DCO action will reject your PR.

**`git commit --no-verify` is a project policy violation.** The pre-commit hook is fast and forgiving (lint-staged on changed files + `tsc --noEmit`). If a hook fails, fix the issue and create a new commit — never amend, never bypass. CI re-runs the same checks on every PR, so any local bypass gets caught.

Commit messages follow the [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/) spec. The `commitlint.config.mjs` rules at the repo root are the authoritative list of allowed types.

Group related changes into atomic, meaningful commits. Don't merge a PR with a chain of "fix lint" / "fix typecheck" commits — squash them locally before pushing.

## Code style

- **TypeScript `strict: true`** with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`. The project tsconfig forbids loosening these.
- **No `any` outside test files.** If TypeScript complains: fix the type, narrow it, refactor, or introduce a typed abstraction. Never use `any` to silence the compiler in production code. Test files (`*.test.ts`, `*.spec.ts`) get a narrow exemption for mock flexibility.
- **No `// eslint-disable*` or `// @ts-*` directives** anywhere — not in source, not in tests. ESLint config bans them outright.
- **Prettier** formats all `.ts/.tsx/.mjs/.cjs/.json/.md/.yml/.yaml` files. The pre-commit hook runs `prettier --check`; CI does the same.
- **TSDoc on every exported symbol.** Module-level comments explain the _why_; inline comments explain intent, not mechanics.
- **No console.log in published packages.** The demo (`apps/demo-cli`) is the exception and has an explicit ESLint override.

## TDD expectation

We write the failing test **before** the implementation.

The scaffolding PR shipped intentionally-red TDD tests for the v0.1 router, policy, and adapter packages. The error message in each red test points at its tracked issue (e.g., `"Router.complete is not yet implemented — see issue #2"`). **Do not make those tests pass by editing the test.** The issue's acceptance criteria are how the test goes green.

When implementing a feature:

1. Write the failing test first
2. Verify it fails for the right reason
3. Implement the minimum needed to make it pass
4. Refactor

CI runs all tests on every PR. The pre-commit hook does NOT run tests (red TDD would block every commit) — that's by design.

## Tests

```bash
pnpm test                                         # all packages
pnpm --filter @tierfall/core test                 # one package
pnpm --filter @tierfall/adapter-ollama test       # one adapter
```

Unit tests live alongside source (`test/` per package). Integration tests against a live Ollama use the demo's Docker Compose stack (`apps/demo-cli/docker-compose.yml`).

Cloud-tier adapter integration tests gate themselves on environment variables (e.g., `ANTHROPIC_API_KEY`). Without keys, those tests skip cleanly — they don't fail.

## Adding a new adapter

The repo ships a scaffold script:

```bash
pnpm scaffold:adapter groq
```

This creates `packages/adapter-groq/` with the canonical structure (package.json, tsconfig, tsup, tests, CLAUDE.md, README). Then:

1. Edit `src/adapter.ts` to set the correct `tier` and `capability` defaults
2. Implement the `complete()` method (the scaffold ships a failing skeleton)
3. Add integration tests
4. Open an issue (`type:feature`, `area:adapter`, `adapter:groq`) and a draft PR against `develop` linking it

**Vendor neutrality is enforced.** Reviewers will check that:

- README/docs/demo mention the new vendor at the same volume as existing adapters
- The new package implements `@tierfall/core`'s `Adapter` interface — no vendor-specific shape leaks into core
- Model strings live in user config or `presets.ts`, never hardcoded in the adapter body

Run `.claude/commands/check-vendor-neutrality.md` if you have Claude Code; otherwise audit manually.

## Changesets

Any PR that touches a publishable package (`packages/*`) needs a changeset:

```bash
pnpm changeset
```

The tool prompts you to pick the bump level (`patch` / `minor` / `major`) and write a one-line summary. Commit the resulting `.changeset/*.md` file alongside your code changes.

In v0.x, the four published packages (`@tierfall/core`, `@tierfall/adapter-*`) version in **lockstep** via changesets' `linked` config. Independent versioning may come back at v1.0.

Demo (`apps/demo-cli`) and docs (`apps/docs`) are private and never get changesets.

## PR process

1. Open a PR from your `feat/...` branch into `develop`
2. The PR body must include `Closes #N` linking to the tracked issue
3. The project board auto-moves your card to **In Review** on PR open
4. CI runs: lint, typecheck, test, build, publint, attw, knip, CodeQL — all must pass
5. Request review; address feedback in new commits (never `--amend`)
6. On merge into `develop`, the board card moves to **Done**
7. Your changeset(s) accumulate; the next release PR (`develop → main`) consumes them

Keep PRs focused: **one logical unit per PR**. Typically one PR per issue. Reviewers will ask you to split if a PR mixes concerns.

## Release process

Releases are maintainer-only.

1. When `develop` has accumulated enough changesets, open a release PR titled `release: vX.Y.Z`
2. Merge `develop → main` after CI is green and a maintainer reviews
3. Push to `main` triggers `.github/workflows/release.yml`
4. The workflow runs `pnpm changeset version` (bumps package versions, updates CHANGELOGs), then `pnpm changeset publish` to npm
5. A git tag `vX.Y.Z` is created from `main`

`NPM_TOKEN` must be configured as a repo secret before the first release.

## Code of Conduct

By contributing you agree to abide by the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Report violations to `conduct@tierfall.dev`.

## License

TierFall is licensed under [Apache 2.0](LICENSE). By submitting a contribution under DCO sign-off you agree to license it under the same terms.
