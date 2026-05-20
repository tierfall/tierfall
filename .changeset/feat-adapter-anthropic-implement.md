---
'@tierfall/core': minor
---

Implement `AnthropicAdapter.complete` against `POST /v1/messages`. The premium-cloud tier is now real: a request flowing through `Router([new AnthropicAdapter({ apiKey, model: 'claude-sonnet-4-7' })])` produces actual Claude output, a `BudgetExceededError` on rate limit, or a `ProviderUnavailableError` on any other failure.

- HTTP plumbing isolated in `src/http.ts` (`postMessages` + 30s AbortController timeout + `x-api-key` + `anthropic-version: 2023-06-01`)
- System messages extracted to top-level `system` field (Anthropic forbids `role: 'system'` in `messages[]`)
- Content blocks: `type: 'text'` concatenated; `tool_use` and other types ignored in v0.1
- 429 (rate limit / quota) → `BudgetExceededError`; other 4xx/5xx → `ProviderUnavailableError`
- `requires.tools === true` rejected pre-HTTP with `CapabilityMismatchError` — wire-level tool calling lands in v0.4
- 9 unit tests with mocked fetch; no integration tests (real API calls cost money)
- No `@anthropic-ai/sdk` dependency — built-in fetch only

Closes #8.
