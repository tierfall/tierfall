# Repository Structure

> Canonical tree, auto-updated. Every file has one clear responsibility; if you're not sure where something belongs, this is the index.

## Top level

```
tierfall/
├── .changeset/                     # pending version bumps; one .md per change
├── .claude/
│   ├── settings.json               # hooks, allowed tools, output style
│   ├── commands/                   # repo-specific slash commands (/new-adapter, /check-vendor-neutrality, /release-prep)
│   └── skills/                     # gitnexus-generated repo-specific skills (populated post-merge)
├── .devcontainer/devcontainer.json # one-click contributor setup
├── .github/
│   ├── workflows/                  # CI, release, codeql, dco, project-board, refresh-agents-md
│   ├── ISSUE_TEMPLATE/             # bug, feature, adapter
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   └── dependabot.yml              # security-only (Renovate handles version bumps)
├── .husky/                         # pre-commit (lint-staged + tsc), commit-msg (commitlint)
├── apps/                           # private; never published
│   ├── demo-cli/                   # containerized demo — docker compose up
│   └── docs/                       # Fumadocs site
├── packages/                       # published to npm under @tierfall/*
│   ├── core/                       # @tierfall/core — Adapter interface, Router, Policy, errors, types
│   ├── adapter-ollama/             # @tierfall/adapter-ollama (on-device, self-hosted edge)
│   ├── adapter-openai-compatible/  # @tierfall/adapter-openai-compatible (+ /presets sub-export)
│   └── adapter-anthropic/          # @tierfall/adapter-anthropic
├── docs/
│   ├── STRUCTURE.md                # this file
│   └── superpowers/
│       ├── specs/                  # design specs (frozen-in-time records)
│       └── plans/                  # implementation plans
├── tools/
│   ├── scaffold-adapter.ts         # pnpm scaffold:adapter <name>
│   └── tsconfig.json
├── AGENTS.md                       # gitnexus-generated architecture truth (refreshed weekly)
├── CLAUDE.md                       # root Claude context (high-level only)
├── CHANGELOG.md                    # managed by changesets
├── CODE_OF_CONDUCT.md              # Contributor Covenant 2.1
├── CONTRIBUTING.md                 # canonical contribution rules
├── LICENSE                         # Apache-2.0
├── README.md                       # project orientation
├── SECURITY.md                     # vulnerability disclosure
├── commitlint.config.mjs
├── eslint.config.mjs               # flat config; --max-warnings=0 everywhere
├── knip.json                       # unused-code detection
├── nx.json                         # workspace build cache
├── package.json
├── pnpm-workspace.yaml             # packages/* + apps/*
├── renovate.json                   # automated dependency updates
├── tsconfig.base.json              # shared strict compiler options
└── tsconfig.json                   # project references stub
```

## What goes where

| If you need to...                | Look in                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Understand the routing algorithm | `packages/core/src/router.ts` + `packages/core/CLAUDE.md`                               |
| Add a new vendor adapter         | Run `pnpm scaffold:adapter <name>` then edit `packages/adapter-<name>/`                 |
| Tweak ESLint or TS strictness    | `eslint.config.mjs` and `tsconfig.base.json`                                            |
| Update demo scenarios            | `apps/demo-cli/src/main.ts` (Compose stack lives at `apps/demo-cli/docker-compose.yml`) |
| Write or read user-facing docs   | `apps/docs/content/docs/**/*.mdx`                                                       |
| See pending releases             | `.changeset/*.md` files                                                                 |
| Inspect the test-blocking issues | `gh issue list --label "type:feature"`                                                  |

## Naming conventions

- **Published packages**: `@tierfall/<name>` (e.g., `@tierfall/core`, `@tierfall/adapter-ollama`)
- **Private apps**: `@tierfall-app/<name>` (e.g., `@tierfall-app/demo-cli`, `@tierfall-app/docs`)
- **Branches**: `<type>/<short-description>` (e.g., `feat/adapter-groq`)
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`, `build:`, `ci:`, `revert:`)
- **Issues**: descriptive titles; labels carry classification (`area:`, `type:`, `prio:`, `platform:`, `adapter:`)

## See also

- `CLAUDE.md` — root Claude context
- `CONTRIBUTING.md` — contribution rules
- `README.md` — project orientation
- `AGENTS.md` — generated architecture description (refreshed weekly)
