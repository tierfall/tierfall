# packages/adapter-anthropic — Claude context

`@tierfall/adapter-anthropic` is the **premium-cloud** adapter for Anthropic's
Messages API. It implements `Adapter` from `@tierfall/core` and is the canonical
top-of-stack tier in fall-never-climb chains.

## Key contracts

- `AnthropicAdapter` implements `Adapter` from `@tierfall/core`.
- `tier = 'premium-cloud'`. Cost is non-zero; the issue #8 implementation
  populates per-model pricing from Anthropic's public rate card.
- Default `baseUrl` is the Anthropic public endpoint; override for proxies.

## Implementation status

The skeleton throws `not yet implemented — see issue #8`. Real implementation:

- Uses Anthropic's Messages API (`POST /v1/messages`).
- System messages are mapped to the top-level `system` field per the SDK shape
  (not interleaved in `messages` like OpenAI's Chat Completions).
- 401 / 403 → `ProviderUnavailableError` (auth class), preserve `cause`.
- 429 / 5xx → `ProviderUnavailableError` (retryable class).

## When changing this package

Run `pnpm --filter @tierfall/adapter-anthropic test`. The red TDD test must
only flip green when issue #8 closes — don't make it pass by altering the test.

## Vendor neutrality

This package depends on `@tierfall/core` only. It does NOT depend on
`@anthropic-ai/sdk` at scaffold; the issue #8 implementation may add it as
a runtime dependency, but `@tierfall/core` must never see it transitively.
