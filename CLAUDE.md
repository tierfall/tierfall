# TierFall — root Claude context

Local-first AI routing for TypeScript. **Fall, never climb** — on failure / budget / capability
mismatch, the router moves to a _cheaper_ tier, never a more expensive one.

## Layout

```
packages/
  core/                        # @tierfall/core — Adapter interface, Router, Policy, types
  adapter-ollama/              # @tierfall/adapter-ollama
  adapter-openai-compatible/   # @tierfall/adapter-openai-compatible + /presets
  adapter-anthropic/           # @tierfall/adapter-anthropic
apps/
  demo-cli/                    # docker compose up — boots Ollama + demo
  docs/                        # Fumadocs site
docs/
  STRUCTURE.md                 # canonical tree, auto-updated
  superpowers/specs/           # design specs (frozen-in-time records)
  superpowers/plans/           # implementation plans
```

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
