# packages/adapter-anthropic — Claude context

`@tierfall/adapter-anthropic` is the **premium-cloud** adapter for Anthropic's
Messages API. It implements `Adapter` from `@tierfall/core` and is the canonical
top-of-stack tier in fall-never-climb chains.

## Key contracts

- `AnthropicAdapter` implements `Adapter` from `@tierfall/core`.
- `tier = 'premium-cloud'`. Cost is non-zero — Sonnet 4.7 defaults to
  $3/MTok input + $15/MTok output. Verify against the live rate card at
  adoption; override via `config.capability`.
- Default `baseUrl` is `https://api.anthropic.com`; override for proxies.
- `config.apiKey` is **required**. The constructor throws on missing/empty
  values — that's a config bug, not a runtime fall.

## Implementation gotchas

- **System messages live at the top level.** Anthropic forbids `role: 'system'`
  inside `messages[]`. The adapter pulls all `role === 'system'` messages out
  of `request.messages`, concatenates their content with `\n\n`, and sets the
  top-level `system` field. Remaining messages (user/assistant) go in
  `messages[]`. If no system messages, the field is omitted.
- **Response content is an array of blocks.** Anthropic returns `content:
[{type: 'text', text: '...'}, {type: 'tool_use', ...}]`. The adapter
  concatenates `text` from `type: 'text'` blocks and silently ignores other
  block types in v0.1. A response with no text blocks (e.g., model returns
  only `tool_use`) produces an empty string — `LLMResponse.text` is still a
  valid `string`.
- **`max_tokens` is required by Anthropic.** Defaults to 4096; override via
  `request.maxOutputTokens`.
- **429 maps to `BudgetExceededError`**, not `ProviderUnavailableError`.
  Rate limits and quota errors are budget signals — the router should fall
  to a cheaper tier rather than keep retrying premium. Other 4xx/5xx errors
  map to `ProviderUnavailableError`.
- **Tool calling, streaming, structured output**: capability flags are all
  `false` in v0.1 even though Sonnet 4.7 supports them natively. The adapter
  doesn't yet implement wire-level integration; that lands in v0.4. A
  `requires.tools === true` request is rejected pre-HTTP with
  `CapabilityMismatchError`. v0.4 flips these flags alongside implementation.
- **No `@anthropic-ai/sdk` dependency.** The adapter uses Node 24's built-in
  fetch. Keeps the dependency graph clean and the vendor-neutrality story
  honest — `@tierfall/core` never sees a vendor SDK transitively.
- **Auth headers**: `x-api-key` for auth + `anthropic-version: 2023-06-01`
  for API stability.
- **Timeout**: fixed 30s via `AbortController`. No per-request override in
  v0.1.

## Vendor neutrality

This package depends on `@tierfall/core` only — no `@anthropic-ai/sdk`,
no `openai`, nothing vendor-specific. Verified by `pnpm why` returning
nothing for those package names from `packages/core/`.

## Testing

All unit tests in `test/adapter.test.ts` with `jest.spyOn(global, 'fetch')`.
No integration tests in v0.1 — real Anthropic API calls cost actual money,
and we don't want CI burning credits on every PR. v0.4 can add env-gated
integration tests when streaming + tools land.

Tests import explicitly from `@jest/globals` because pnpm's strict hoisting
doesn't expose Jest's globals via `@types/jest`.

## When changing this package

Run `pnpm --filter @tierfall/adapter-anthropic test`. The 9 unit tests must
stay green. If you change the wire-shape mapping in `src/adapter.ts` (e.g.,
adding a new field to `LLMResponse.usage`), update `src/http.ts`'s
`AnthropicMessagesResponse` type and add a matching unit test asserting the
new field's mapping.

If you update the default pricing in `DEFAULT_INPUT_COST_PER_MTOK` /
`DEFAULT_OUTPUT_COST_PER_MTOK`, also update the happy-path test's
`estimatedCostUSD` assertion.
