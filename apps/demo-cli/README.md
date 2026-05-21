# @tierfall-app/demo-cli

Containerized end-to-end demo of TierFall's fall-never-climb routing.

## Run via Docker Compose (recommended)

```bash
docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo
```

First run pulls `llama3.2:3b` (~2GB) and may take 10–20 minutes. Subsequent runs reuse the cached model volume and complete in ~30 seconds.

Optional environment variables (pass via `.env` at repo root):

| Env                 | Effect                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Enables premium-cloud tier via `@tierfall/adapter-anthropic` (Claude Sonnet 4.7). Takes precedence over `OPENAI_API_KEY`. |
| `OPENAI_API_KEY`    | Enables premium-cloud tier via the `openai` preset, but only if `ANTHROPIC_API_KEY` is unset.                             |
| `DEEPSEEK_API_KEY`  | Enables cheap-cloud tier via the `deepseek` preset.                                                                       |
| `OLLAMA_BASE_URL`   | Override Ollama URL (default: `http://localhost:11434`; inside Compose: `http://ollama:11434`).                           |

Missing keys log a skip line; the demo runs with whatever's available. Ollama is always-on (Compose provides it).

## What the four scenarios show

1. **Basic chat** — request flows to the highest-priority tier and returns. `fallChain` is empty.
2. **Budget filter (silent)** — request includes `maxCostUSD: 0.0001`. The _policy_ filters premium and cheap out at pre-flight; the _router_ never sees them. `fallChain` is empty even though tiers were excluded — because a filter is silent, not a fall.
3. **Capability mismatch** — request requires tool calling (`requires.tools: true`), but the demo force-constructs Router with only the local adapter. Ollama rejects pre-HTTP with `CapabilityMismatchError`; router throws `NoTierAvailableError` with a 1-deep fallChain.
4. **Provider down** — the highest-priority adapter is wrapped to throw `ProviderUnavailableError`. Router falls past it transparently; the next tier serves. `fallChain[0].reason === 'provider-unavailable'`.

## Run locally without Docker

If you already have Ollama running locally with `llama3.2:3b` pulled:

```bash
pnpm install
pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-anthropic,adapter-openai-compatible,demo-cli
node apps/demo-cli/dist/main.cjs
```

Set env vars via your shell (e.g., `ANTHROPIC_API_KEY=sk-ant-... node apps/demo-cli/dist/main.cjs`).
