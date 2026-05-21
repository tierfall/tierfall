# TierFall — Bootstrap Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review before Phase 2 (planning)
**Author:** Brainstorming session, Claude Opus 4.7
**Scope:** Strategic + structural decisions required before scaffolding the repository. This spec is the input to the Phase 2 implementation plan.

---

## 1. Purpose

TierFall is a TypeScript SDK that routes AI calls between four tiers — **on-device, self-hosted edge, cheap cloud, premium cloud** — based on declarative policy. The core thesis is **"Fall, never climb"**: on failure, capability mismatch, or budget breach, the router falls to a _cheaper_ tier, never a more expensive one. Climbing to premium is explicit, observable, and never the default.

TierFall is positioned to sit **underneath** frameworks like the Vercel AI SDK, not replace them.

This spec captures the decisions made during the kickoff brainstorm. It does not re-state the strategic frame from the project kickoff prompt; that document is the canonical statement of vision, hard constraints, and roadmap, and remains authoritative.

## 2. Strategic frame (recap, not redecided)

- **v0.1 scope:** core router + ≥2 vendor adapters + containerized demo (Node-only)
- **Roadmap:** v0.2 browser → v0.3 React Native → v0.4 tool calls + structured output → v0.5 caching → v1.0 Vercel AI SDK compatibility shim
- **Architecture:** Nx-managed TypeScript monorepo
- **Branching:** two-branch model — `main` (stable) + `develop` (integration), GitHub default = `develop`
- **Sixteen hard constraints** from the kickoff prompt are load-bearing on every decision below; see `CONTRIBUTING.md` (to be authored in Phase 3) for the canonical list

## 3. Decisions

### 3.1 Foundation

| Decision              | Choice                            | Reasoning                                                                                                                                         |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| License               | **Apache 2.0**                    | Explicit patent grant matters in AI tooling; signals seriousness to enterprise adopters; aligns with Anthropic/Google/Microsoft AI tool licensing |
| Package manager       | **pnpm**                          | Strictest dep hoisting prevents phantom deps across adapter packages; workspace-protocol native; industry-standard with Nx in 2026                |
| Build tool (libs)     | **tsup**                          | esbuild-driven, dual ESM/CJS + `.d.ts`, minimal config, the de facto standard for TS library publishing                                           |
| Build tool (demo app) | **tsup** (Node CJS target)        | Single bundler across the repo; produces a `dist/main.js` the Docker runtime loads via `node`                                                     |
| Build tool (docs app) | **Next.js** (via Fumadocs)        | Required by Fumadocs; only used inside `apps/docs`                                                                                                |
| Dev runner            | **tsx**                           | Local iteration without a build step; never used in CI or Docker                                                                                  |
| Type checking         | **`tsc --noEmit`** via Nx targets | Pure type verification; tsup/esbuild does not type-check on its own                                                                               |
| Node version          | **24.x LTS** (pin specific patch) | Current Active LTS; matches user's local environment                                                                                              |

### 3.2 v0.1 vendor adapter set

Three adapters ship in v0.1 to make vendor neutrality structural rather than performative:

| Package                               | API shape               | Tiers covered                                                                              |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `@tierfall/adapter-ollama`            | Ollama native           | on-device, self-hosted edge                                                                |
| `@tierfall/adapter-openai-compatible` | OpenAI Chat Completions | cheap cloud (Groq/DeepSeek/Cerebras), premium cloud (OpenAI), self-hosted (vLLM/LM Studio) |
| `@tierfall/adapter-anthropic`         | Anthropic Messages      | premium cloud (Claude)                                                                     |

**Rationale for including Anthropic from commit one:** if v0.1 ships only OpenAI-compatible adapters, the core `Adapter` interface accidentally bakes in OpenAI assumptions and the regression isn't visible until v0.2. Anthropic's distinct API shape forces the interface to be properly polymorphic.

**Presets:** `@tierfall/adapter-openai-compatible` exports a `/presets` sub-export with pre-configured base URL + recommended-model defaults for popular endpoints (Groq, DeepSeek, OpenAI, Cerebras, OpenRouter). Convenience without sneaking vendor preference into core.

**Naming convention:** `@tierfall/core`, `@tierfall/adapter-<vendor>`. Explicitly `adapter-openai-compatible`, not `adapter-openai`, to preserve neutrality in package names.

### 3.3 Repo structure (Nx monorepo)

```
tierfall/
├── .changeset/
├── .claude/
│   ├── settings.json
│   ├── commands/                     # repo-specific slash commands
│   └── skills/                       # gitnexus-generated, repo-specific
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # lint + typecheck + test + build on develop PRs
│   │   ├── release.yml               # main-only: tag + npm publish
│   │   ├── project-board.yml         # auto-move kanban cards
│   │   ├── codeql.yml                # weekly + PR security analysis
│   │   ├── refresh-agents-md.yml     # weekly AGENTS.md regeneration
│   │   └── dco.yml                   # contributor sign-off enforcement
│   ├── ISSUE_TEMPLATE/{bug,feature,adapter}.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── .husky/{pre-commit,commit-msg}
├── .devcontainer/devcontainer.json
├── apps/
│   ├── demo-cli/
│   │   ├── src/
│   │   ├── Dockerfile                # multi-stage, non-root, pinned base
│   │   ├── docker-compose.yml        # demo + ollama + ollama-init
│   │   ├── CLAUDE.md
│   │   ├── README.md
│   │   ├── package.json
│   │   ├── project.json
│   │   └── tsconfig.json
│   └── docs/                         # Fumadocs (Next.js)
│       ├── content/                  # MDX, organized by phase
│       ├── app/
│       ├── CLAUDE.md
│       ├── package.json
│       └── project.json
├── packages/
│   ├── core/                         # @tierfall/core — interfaces only
│   │   ├── src/{adapter,router,policy,tier,types,errors,index}.ts
│   │   ├── test/
│   │   ├── CLAUDE.md
│   │   ├── README.md
│   │   ├── package.json
│   │   ├── project.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   ├── adapter-ollama/               # @tierfall/adapter-ollama
│   ├── adapter-openai-compatible/    # @tierfall/adapter-openai-compatible + /presets
│   └── adapter-anthropic/            # @tierfall/adapter-anthropic
├── docs/
│   ├── STRUCTURE.md                  # canonical tree, auto-updated
│   └── superpowers/specs/            # brainstorm specs (this file lives here)
├── tools/
│   └── scaffold-adapter.ts           # `pnpm scaffold:adapter <name>`
├── AGENTS.md                         # gitnexus-generated
├── CLAUDE.md                         # root — short, high-level only
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md                   # canonical rule source
├── LICENSE
├── README.md
├── commitlint.config.mjs
├── eslint.config.mjs
├── nx.json
├── package.json
├── pnpm-workspace.yaml
├── renovate.json
├── tsconfig.base.json
└── tsconfig.json
```

**Key invariant:** `@tierfall/core` contains the `Adapter` interface, the router, the policy engine, and shared types — but **no adapter implementations and no vendor SDK dependencies**. Nothing that imports `@tierfall/core` accidentally drags in a vendor SDK. Each adapter is a strictly opt-in dependency in its own package.

### 3.4 CLAUDE.md split strategy

- **Root `CLAUDE.md`** — ≤80 lines: one-sentence purpose, ASCII tree, key constraints with pointer to `CONTRIBUTING.md`, branch model paragraph, "where to find" pointers
- **`packages/core/CLAUDE.md`** — Adapter interface contract, router state machine described in words, policy DSL, gotchas
- **`packages/adapter-*/CLAUDE.md`** — API shape implemented, subtle vendor-specific differences, streaming format, default model recommendations (docs only — no defaults in code)
- **`apps/demo-cli/CLAUDE.md`** — demo purpose, scenario architecture, Compose layout
- **`apps/docs/CLAUDE.md`** — Fumadocs structure, MDX conventions, phase organization
- **`AGENTS.md` at root** — gitnexus-generated architecture truth; CLAUDE.md files point to it, never duplicate it

### 3.5 GitHub Projects taxonomy

**Label families** (~25 labels total, prefix-namespaced):

- `area:` — core / adapter / demo / docs / ci / meta
- `type:` — feature / bug / refactor / perf / docs / test / chore / security / rfc
- `prio:` — p0 / p1 / p2 / p3
- `platform:` — node / browser / react-native / edge
- `adapter:` — ollama / openai-compatible / anthropic _(new adapters add labels)_
- **Status (unprefixed):** good-first-issue, help-wanted, needs-design, needs-repro, blocked, duplicate, wontfix, invalid

**Milestones:** scope-bound, no hard dates. Each milestone description carries a soft target window and explicit non-goals.

| Milestone              | Soft target |
| ---------------------- | ----------- |
| v0.1.0 — Foundation    | Q3 2026     |
| v0.2.0 — Browser       | Q4 2026     |
| v0.3.0 — Mobile        | Q1 2027     |
| v0.4.0 — Tools         | Q2 2027     |
| v0.5.0 — Caching       | Q3 2027     |
| v1.0.0 — AI SDK compat | Q4 2027     |

**v0.1 backlog:** 12–15 issues with acceptance criteria, ≥4 marked `good-first-issue`. Candidate first-issues: `.editorconfig` addition, document the four tiers in Fumadocs, TSDoc examples for `Adapter` interface, `prettier-plugin-organize-imports` wiring, "rotate model across all three adapters" README example.

### 3.6 Demo Docker setup

**Base image:** `node:24.x-alpine` (pin specific patch) for both build and runtime stages, `USER node` (uid 1000). Distroless deferred to docs as the production hardening recipe — demo prioritizes approachability and `docker exec` debuggability.

**Compose services:**

- `ollama` — pinned `ollama/ollama` version, named volume for model persistence, healthcheck
- `ollama-init` — one-shot service that pulls `llama3.2:3b`, exits cleanly; idempotent across runs
- `demo` — depends on `ollama-init` completing successfully; reads cloud API keys from env (`${ANTHROPIC_API_KEY:-}` etc., default empty)

**`docker compose --profile cloud up`** — opt-in profile that runs only cloud-tier scenarios for contributors who prefer bringing keys over pulling Ollama models.

**Graceful degradation:** at startup, demo checks env presence per cloud adapter; missing-key adapters are skipped with a clear log line (`[tierfall] Anthropic adapter skipped — ANTHROPIC_API_KEY not set`) and demo continues with available adapters. If only Ollama is available, the demo still demonstrates Fall behavior by tripping budget/capability constraints — the router erroring with a "would need to climb" diagnostic is itself a valid teaching outcome.

**Demo scenarios (four, all observable in logs):**

1. **Basic chat** — happy path on the configured starting tier
2. **Budget breach → fall** — artificially low `maxCostUSD` on premium; router falls to cheap then local
3. **Capability mismatch** — tool-calling requested; local model lacks support; router responds per policy
4. **Provider down** — one adapter's network broken; router falls past it transparently

Each scenario prints: expected behavior, tier landed on, fall diagnostic chain. The output **is** the documentation.

**v0.3 React Native exception** — documented in root `CLAUDE.md` from day one: `apps/demo-mobile` ships as an Expo project with `npx expo start`, not Compose.

### 3.7 Release flow

**Direct `develop → main` PRs** for v0.x. No Git Flow `release/*` branches at v0.1 — they add ceremony without removing risk for an indie project of this scale. **Revisit at v1.0** when API freeze + backport candidates create genuine stabilization needs.

Release PR is titled `release: vX.Y.Z`, merged into `main`, tagged from `main` post-merge. npm publish triggered from a `main`-only workflow that runs after the tag push.

### 3.8 Recommended additions

**Tier 1 — required:**

- **changesets** — independent versioning for multi-package monorepo; husky hook requires a changeset when `packages/*` change; eliminates need for semantic-release
- **publint** — validates publishing config in CI
- **arethetypeswrong/cli (`attw`)** — validates `.d.ts` resolves correctly in ESM and CJS
- **DCO** (not CLA) — `git commit -s` enforced via GitHub action; lightweight chain of custody

**Tier 2 — high value:**

- **Renovate** — automates "latest stable, pinned" discipline; auto-merge dev-dep patches on green CI, manual for everything else
- **CodeQL** — free GitHub-native SAST, weekly + PR
- **Knip** — finds unused exports/files/deps; CI step

**Tier 3 — nice to have:**

- **Codecov** — badge + PR coverage diff only; **no coverage gating in CI**
- **devcontainer.json** — minimal one-click contributor setup

**Explicitly excluded:** semantic-release (overlaps with changesets), CLA bot (DCO is enough for indie OSS), GitHub Discussions (enable when traffic warrants), All Contributors bot (premature at v0.1), Stale-bot (don't auto-close at v0.1).

### 3.9 Token-saving mechanisms (beyond the kickoff list)

| Mechanism                                  | Purpose                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/commands/new-adapter`             | Scaffold a new adapter package via slash command                                                                                             |
| `.claude/commands/check-vendor-neutrality` | Audit README/docs/demo for asymmetric vendor mentions; symmetry check on adapter exports; flag hardcoded model strings outside presets       |
| `.claude/commands/release-prep`            | Pre-flight before `develop → main`: `publint`, `attw`, `changeset version`, README "What works today" check, open p0 list                    |
| `UserPromptSubmit` hook                    | Injects active branch + active package context on each turn                                                                                  |
| Concrete `.claudeignore`                   | Populated up front with `dist/`, `coverage/`, `.nx/cache/`, `pnpm-lock.yaml`, `*.tsbuildinfo`, etc. — `.changeset/` deliberately NOT ignored |
| `docs/STRUCTURE.md`                        | Canonical tree, auto-updated by Husky post-merge hook                                                                                        |
| `pnpm scaffold:adapter <name>`             | Script generates new adapter package from template                                                                                           |
| Verbose-off conventions                    | `--quiet` / `--pretty false` / `--reporter=silent` across lint/tsc/jest/pnpm                                                                 |
| Weekly AGENTS.md refresh action            | Cron job runs `gitnexus analyze`; opens PR on drift                                                                                          |
| `pnpm check` umbrella                      | Single entrypoint: lint + typecheck + test + build                                                                                           |
| `CONTRIBUTING.md` as canonical rules       | Root `CLAUDE.md` points here; loaded on-demand, not duplicated per package                                                                   |

## 4. Phase 3 deliverables (what "done" looks like)

Phase 3 (`/execute-plan`) ends when the scaffolding PR is merged into `develop`. Full v0.1 feature work continues issue-by-issue after Phase 3 per the kickoff prompt's "After Phase 3" section.

**At Phase 3 close, the following must be true:**

- [ ] `https://github.com/tierfall/tierfall` exists, public, `develop` is the GitHub default branch
- [ ] Branch protection configured per constraint #16 (`develop`: required PR review + green CI, no force-push, no deletions; `main`: same plus restricted to PRs from `develop`, no admin bypass)
- [ ] CI workflows live and green on the scaffolding PR: lint (`--max-warnings 0`), typecheck (`tsc --noEmit`), test (`pnpm test`), build (`pnpm build`), `publint`, `attw`, `knip`, CodeQL
- [ ] Pre-commit hook enforcement verified by negative test: a deliberate attempt to commit code containing `: any` outside a test file, and a separate attempt to commit a `// eslint-disable-next-line` directive, both blocked locally with the same checks re-enforced by CI
- [ ] All four directories scaffolded with passing `pnpm typecheck`: `packages/core`, `packages/adapter-ollama`, `packages/adapter-openai-compatible`, `packages/adapter-anthropic`. Adapter packages contain **failing TDD tests** (red) for their unimplemented behavior — these are intentional and tracked as the next backlog issues
- [ ] `@tierfall/core` has no vendor SDK dependencies and no imports from any `@tierfall/adapter-*` package, verified by Nx dependency graph + `pnpm why`
- [ ] `apps/demo-cli` and `apps/docs` packages exist with valid `package.json` + `project.json`; `docker compose -f apps/demo-cli/docker-compose.yml up` boots the Ollama service and the demo container (demo's scenario logic itself ships in subsequent issues — at scaffold close it prints a "scenarios not yet implemented" message and exits cleanly)
- [ ] `apps/docs` Fumadocs site builds and renders the v0.1 documentation skeleton (full content lands via the docs issues in the v0.1 backlog)
- [ ] GitHub Project board populated with the v0.1 milestone and 12–15 issues with acceptance criteria, ≥4 marked `good-first-issue`; scaffolding issue (`#1`) is the merged PR
- [ ] `gitnexus analyze` has been run; `AGENTS.md` and `.claude/skills/` committed via a follow-up docs PR before Phase 3 closes
- [ ] Root README's "What works today" section reflects scaffold-close reality (not v0.1 final reality)
- [ ] `.claude/commands/{new-adapter,check-vendor-neutrality,release-prep}.md` committed
- [ ] DCO action enforces `Signed-off-by` trailers; Renovate has run at least once and opened any pending PRs

## 5. Open decisions deferred to Phase 2 planning

None — all strategic and structural decisions are closed by this spec. Phase 2 produces a file-level implementation plan: exact `package.json` contents, exact `eslint.config.mjs` rule set, exact Husky hook contents, exact CI workflow YAML, the 12–15-issue backlog with acceptance criteria, exact Dockerfile.

## 6. Out of scope for v0.1

- Browser runtime (`platform:browser`) — v0.2
- React Native runtime (`platform:react-native`) — v0.3
- Tool calls + structured output — v0.4
- Response caching, semantic caching — v0.5
- Vercel AI SDK compatibility shim — v1.0
- Gemini adapter — v0.2 (added when browser work begins)
- vLLM/LiteLLM Compose services — until a phase genuinely needs them
- CLA bot, Discussions, All Contributors, Stale-bot — until contributor base/traffic warrants
- `release/vX.Y.Z` Git Flow branches — until v1.0 stabilization

## 7. References

- Kickoff prompt (project frame, 16 hard constraints, roadmap)
- `CONTRIBUTING.md` (to be authored in Phase 3) — canonical rule list
- `AGENTS.md` (to be generated in Phase 3 post-scaffold) — architecture truth
