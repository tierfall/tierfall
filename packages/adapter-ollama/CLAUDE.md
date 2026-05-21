# packages/adapter-ollama — Claude context

`@tierfall/adapter-ollama` is the **on-device** adapter targeting a local Ollama daemon.
It implements the `Adapter` interface from `@tierfall/core` and is the canonical zero-cost
tier for the fall-never-climb router.

## Key contracts

- `OllamaAdapter` implements `Adapter` from `@tierfall/core`.
- `tier = 'on-device'`. Free (cost is `null`); availability depends on the daemon.
- Default `baseUrl` is `http://localhost:11434` (Ollama's stock config).
- `config.apiKey` is accepted for cloud-adapter parity but **ignored** — Ollama doesn't
  authenticate.

## Implementation gotchas

- **`prompt_eval_count` / `eval_count` may be `undefined`** on cached prompts. The adapter
  coalesces to `0` to keep `usage.inputTokens` / `usage.outputTokens` a plain `number`.
- **`baseUrl` trailing slash is normalized** before composing `/api/chat`. Tests verify
  both `http://host:11434` and `http://host:11434/` produce the same URL.
- **Model not found returns HTTP 404**, which maps to `ProviderUnavailableError`. The
  router falls cleanly on this — the adapter doesn't try to be clever.
- **Tool calling** (`requires.tools === true`) is **rejected before any HTTP request** via
  `CapabilityMismatchError`. Ollama does support tool calling for some models, but TierFall
  integration lands in v0.4.
- **Streaming** is not yet implemented; the wire request uses `stream: false`. Streaming
  is on the v0.4 roadmap.
- **Timeout** is fixed at 30 seconds via `AbortController`. No per-request override in
  v0.1.

## Testing

Two suites in `test/`:

- **`adapter.test.ts`** — fast unit tests with `jest.spyOn(global, 'fetch')`. Runs in
  the `test-rest` CI job (and locally via `pnpm --filter @tierfall/adapter-ollama test`).
- **`adapter.integration.test.ts`** — real-Ollama tests, gated on `TIERFALL_OLLAMA_TEST_URL`.
  Skipped locally without env. Run in CI by `test-integration-ollama` against a
  service-container Ollama with `qwen2.5:0.5b`.

The unit run uses `--testPathIgnorePatterns=integration`; the integration run uses
`--testPathPattern=integration`. Tests import explicitly from `@jest/globals` because
pnpm's strict hoisting doesn't expose Jest's globals via the workspace root.

## When changing this package

Run both suites locally if you have an Ollama daemon:

```bash
TIERFALL_OLLAMA_TEST_URL=http://localhost:11434 pnpm --filter @tierfall/adapter-ollama test:integration
pnpm --filter @tierfall/adapter-ollama test
```

If you change the wire-shape mapping in `src/adapter.ts` (e.g., adding a new field to
`LLMResponse.usage`), update `src/http.ts`'s `OllamaChatResponse` type and add a
matching unit test asserting the new field's mapping.
