---
'@tierfall/core': minor
---

Implement `OpenAICompatibleAdapter.complete` against `POST {baseUrl}/chat/completions`. The OpenAI-compatible tier is now real: covers OpenAI, Groq, DeepSeek, Cerebras, OpenRouter, vLLM, LM Studio, and any other vendor speaking the Chat Completions wire format.

- HTTP plumbing isolated in `src/http.ts` (`postChatCompletions` + 30s AbortController timeout + Bearer auth)
- System messages stay in `messages[]` (OpenAI accepts `role: 'system'` natively — unlike Anthropic)
- `content === null` coalesces to empty string when `finish_reason === 'tool_calls'`
- 429 (rate limit / quota) → `BudgetExceededError`; other 4xx/5xx → `ProviderUnavailableError`
- `requires.tools === true` rejected pre-HTTP with `CapabilityMismatchError` — wire-level tool calling lands in v0.4
- Tier is per-instance from `config.tier` (default `'cheap-cloud'`); presets (issue #7) hard-code per provider
- 10 unit tests with mocked fetch; no integration tests (AC permits env-gating)
- No `openai` SDK dependency — built-in fetch only

Closes #6.
