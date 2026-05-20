# @tierfall/core

## 0.1.0

### Minor Changes

- [#28](https://github.com/tierfall/tierfall/pull/28) [`218f74d`](https://github.com/tierfall/tierfall/commit/218f74d73bf72af9aca57cdae726e99539f754d8) Thanks [@ronyv89](https://github.com/ronyv89)! - Implement `AnthropicAdapter.complete` against `POST /v1/messages`. The premium-cloud tier is now real: a request flowing through `Router([new AnthropicAdapter({ apiKey, model: 'claude-sonnet-4-7' })])` produces actual Claude output, a `BudgetExceededError` on rate limit, or a `ProviderUnavailableError` on any other failure.
  - HTTP plumbing isolated in `src/http.ts` (`postMessages` + 30s AbortController timeout + `x-api-key` + `anthropic-version: 2023-06-01`)
  - System messages extracted to top-level `system` field (Anthropic forbids `role: 'system'` in `messages[]`)
  - Content blocks: `type: 'text'` concatenated; `tool_use` and other types ignored in v0.1
  - 429 (rate limit / quota) → `BudgetExceededError`; other 4xx/5xx → `ProviderUnavailableError`
  - `requires.tools === true` rejected pre-HTTP with `CapabilityMismatchError` — wire-level tool calling lands in v0.4
  - 9 unit tests with mocked fetch; no integration tests (real API calls cost money)
  - No `@anthropic-ai/sdk` dependency — built-in fetch only

  Closes [#8](https://github.com/tierfall/tierfall/issues/8).

- [#27](https://github.com/tierfall/tierfall/pull/27) [`63f44a5`](https://github.com/tierfall/tierfall/commit/63f44a583e12e9ac52597790b78c9c9115927d71) Thanks [@ronyv89](https://github.com/ronyv89)! - Implement `OllamaAdapter.complete` against `POST /api/chat`. The on-device tier is now
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

  Closes [#5](https://github.com/tierfall/tierfall/issues/5).

- [#29](https://github.com/tierfall/tierfall/pull/29) [`f0ba1c8`](https://github.com/tierfall/tierfall/commit/f0ba1c85cf128af13b40466c7cf1045177f1522a) Thanks [@ronyv89](https://github.com/ronyv89)! - Implement `OpenAICompatibleAdapter.complete` against `POST {baseUrl}/chat/completions`. The OpenAI-compatible tier is now real: covers OpenAI, Groq, DeepSeek, Cerebras, OpenRouter, vLLM, LM Studio, and any other vendor speaking the Chat Completions wire format.
  - HTTP plumbing isolated in `src/http.ts` (`postChatCompletions` + 30s AbortController timeout + Bearer auth)
  - System messages stay in `messages[]` (OpenAI accepts `role: 'system'` natively — unlike Anthropic)
  - `content === null` coalesces to empty string when `finish_reason === 'tool_calls'`
  - 429 (rate limit / quota) → `BudgetExceededError`; other 4xx/5xx → `ProviderUnavailableError`
  - `requires.tools === true` rejected pre-HTTP with `CapabilityMismatchError` — wire-level tool calling lands in v0.4
  - Tier is per-instance from `config.tier` (default `'cheap-cloud'`); presets (issue [#7](https://github.com/tierfall/tierfall/issues/7)) hard-code per provider
  - 10 unit tests with mocked fetch; no integration tests (AC permits env-gating)
  - No `openai` SDK dependency — built-in fetch only

  Closes [#6](https://github.com/tierfall/tierfall/issues/6).

- [#30](https://github.com/tierfall/tierfall/pull/30) [`d58234c`](https://github.com/tierfall/tierfall/commit/d58234c65daf1f486f6e0f87392fd9db45d01ec3) Thanks [@ronyv89](https://github.com/ronyv89)! - Implement the five blessed presets in `@tierfall/adapter-openai-compatible/presets`: `groq`, `deepseek`, `openai`, `cerebras`, `openrouter`. Each returns a partial `OpenAICompatibleAdapterConfig` with vendor-correct base URL, default model, default tier, and realistic per-provider pricing.

  ```ts
  import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
  import { presets } from '@tierfall/adapter-openai-compatible/presets';

  const adapter = new OpenAICompatibleAdapter(
    presets.deepseek({ apiKey: process.env.DEEPSEEK_API_KEY! }),
  );
  ```

  Override semantics: top-level fields use shallow merge; `capability` deep-merges one level.

  This PR also closes the v0.1 red-TDD chain. `presets.test.ts` was the last red test in `test-rest`; the job's `continue-on-error: true` is removed by this PR. After merge, `test-rest` is a required check on `develop` and `main` (out-of-band branch-protection update required).

  Closes [#7](https://github.com/tierfall/tierfall/issues/7).

- [#25](https://github.com/tierfall/tierfall/pull/25) [`b7237be`](https://github.com/tierfall/tierfall/commit/b7237be33aad4882372fccb8d78e0978b4295383) Thanks [@ronyv89](https://github.com/ronyv89)! - Implement the `DefaultPolicy.evaluate` declarative evaluator. Given a request and an adapter list, returns the filtered + sorted subset the Router should attempt:
  - Filters by `request.requires.{minContextWindowTokens, tools, streaming, structuredOutput}` (AND)
  - Filters by `request.maxCostUSD` using a 500-input + 500-output token budget
  - Stable-sorts survivors by tier-index ascending (premium-cloud → on-device)
  - Empty result surfaces impossible-to-satisfy requests via the Router constructor's empty-list throw

  Closes [#3](https://github.com/tierfall/tierfall/issues/3).

- [#31](https://github.com/tierfall/tierfall/pull/31) [`45979d3`](https://github.com/tierfall/tierfall/commit/45979d37eccdbd079681e901d7083a2cc952a75d) Thanks [@ronyv89](https://github.com/ronyv89)! - Add `formatFallChain(chain)` helper for rendering `FallDiagnostic[]` as a multi-line string suitable for demo logs. Indented numbered-list format; empty chain returns empty string. Useful when surfacing fall chains via `console.log` or in error messages.

  Each of the four error classes (`BudgetExceededError`, `CapabilityMismatchError`, `ProviderUnavailableError`, `NoTierAvailableError`) gains a TSDoc `@example` block showing the typical throw site.

  Closes [#4](https://github.com/tierfall/tierfall/issues/4).

- [#24](https://github.com/tierfall/tierfall/pull/24) [`ecdded2`](https://github.com/tierfall/tierfall/commit/ecdded23eda7f9bafd1438e805120af66b27ff10) Thanks [@ronyv89](https://github.com/ronyv89)! - Implement the Router fall-never-climb state machine. Adapters in the constructor's list are attempted in order; on `BudgetExceededError`, `CapabilityMismatchError`, `ProviderUnavailableError`, or any unexpected error, the router falls to the next adapter and records a `FallDiagnostic` on the response's `fallChain`. When all adapters fail, throws `NoTierAvailableError` carrying the full chain.

  Closes [#2](https://github.com/tierfall/tierfall/issues/2).
