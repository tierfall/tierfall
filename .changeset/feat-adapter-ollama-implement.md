---
'@tierfall/core': minor
---

Implement `OllamaAdapter.complete` against `POST /api/chat`. The on-device tier is now
real: a request flowing through `Router([new OllamaAdapter({ model: 'llama3.2:3b' })])`
produces actual LLM output, or a clean `ProviderUnavailableError` if the daemon is
offline.

- HTTP plumbing isolated in `src/http.ts` (`postChat` + 30s AbortController timeout)
- `requires.tools === true` rejects with `CapabilityMismatchError` before any HTTP
- Network / 4xx / 5xx / malformed-JSON / shape-violation all map to
  `ProviderUnavailableError`
- `usage.inputTokens` / `outputTokens` extracted from Ollama's `prompt_eval_count` /
  `eval_count`; `null` cost (free)
- 8 unit tests with mocked fetch + 3 integration tests gated on
  `TIERFALL_OLLAMA_TEST_URL` env (new CI job runs them against a service container)

Closes #5.
