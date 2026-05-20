# `@tierfall-app/demo-cli` — Claude context

## Purpose

End-to-end demo of the TierFall router falling across configured tiers in a
single process. Lives outside the published packages — exists to make the
"fall, never climb" story tangible to readers in under five minutes.

## Scaffold status (this commit)

- `src/main.ts` is a stub that logs which adapters are configured via env and
  exits 0. **No routing logic runs yet** — that ships in issue #9.
- Dockerfile + docker-compose.yml stand up an Ollama container, pre-pull
  `llama3.2:3b`, then run the demo container against it.
- The `cloud` Compose profile (`docker compose --profile cloud up
demo-cloud-only`) runs the demo without Ollama, for showing the cloud-only
  fall path once scenarios land.

## Files

- `src/main.ts` — entrypoint. Currently logs env-var presence and exits.
- `Dockerfile` — multi-stage Alpine build; non-root `node` user; tini as PID 1.
  Pins Node 24.15.0 + pnpm 10.33.0 explicitly.
- `docker-compose.yml` — `ollama` + `ollama-init` (pulls model) + `demo`.
  Host port for Ollama is published as **11435** (host 11434 frequently
  collides with a local Ollama install); inside the compose network services
  still reach Ollama at `http://ollama:11434`.
- `.env.example` — placeholders for all four credential vars.

## Future scenarios (issue #9)

The demo will run three scenarios sequentially and print a fall diagram:

1. **Cheap-cloud first**: configure DeepSeek + Anthropic + Ollama; small prompt
   demonstrates router landing on DeepSeek.
2. **Forced fall on capability mismatch**: request a structured-output mode
   not yet wired in cheap-cloud; show fall to Anthropic.
3. **Total cloud outage**: clear API keys at runtime; show fall to Ollama.

Until those land, the demo is intentionally a stub that proves the build
pipeline (workspace install → tsup → node) works end-to-end inside Docker.

## Gotchas

- The Dockerfile copies the **entire** `packages/` tree because the demo
  depends on all three workspace-linked adapters; pruning more aggressively
  saves bytes but adds complexity not worth it pre-v0.1.
- `pnpm install --prod` in the builder stage prunes devDeps before the final
  copy; this keeps the runtime image small. Anything imported at runtime must
  be a regular dependency, not devDependency.
- ESLint's `no-console` is allowed only under `apps/demo-cli/**/*.ts` via an
  override in root `eslint.config.mjs`. Other packages still ban console.
