# packages/adapter-openai-compatible — Claude context

`@tierfall/adapter-openai-compatible` targets **any** vendor that speaks the OpenAI
Chat Completions wire format. That covers Groq, DeepSeek, OpenAI itself, Cerebras,
OpenRouter, vLLM gateways, LM Studio, and most self-hosted inference servers.

The default `tier` is `cheap-cloud`, but the tier is per-instance — passing
`tier: 'premium-cloud'` switches behavior accordingly. The five blessed `presets`
(see `src/presets.ts`) hard-code the base URL + sensible default model + matching
tier for each supported provider.

## Key contracts

- `OpenAICompatibleAdapter` implements `Adapter` from `@tierfall/core`.
- Sub-export `@tierfall/adapter-openai-compatible/presets` exposes `presets`.
- Capability defaults assume the modern post-2024 Chat Completions surface
  (tools, streaming, structured output). Vendors that lack a feature should be
  configured to override `capability` at instantiation time.

## Implementation status

The skeleton throws `not yet implemented — see issue #6` for `complete()` and
issue #7 for each preset factory. Both flip green only via those issues.

## When changing this package

Run `pnpm --filter @tierfall/adapter-openai-compatible test`. The red TDD tests
must only flip green when their respective issues close — don't make them pass
by altering the tests.
