# packages/adapter-openai-compatible — Claude context

`@tierfall/adapter-openai-compatible` targets **any** vendor that speaks the OpenAI
Chat Completions wire format. That covers OpenAI itself, Groq, DeepSeek, Cerebras,
OpenRouter, vLLM gateways, LM Studio, and most self-hosted inference servers.

The default `tier` is `cheap-cloud`, but the tier is **per-instance** — passing
`tier: 'premium-cloud'` switches behavior accordingly. The five blessed presets
(see `src/presets.ts`, issue #7) hard-code the base URL + sensible default model +
matching tier for each supported provider.

## Key contracts

- `OpenAICompatibleAdapter` implements `Adapter` from `@tierfall/core`.
- Sub-export `@tierfall/adapter-openai-compatible/presets` exposes `presets`
  (filled by issue #7).
- Default `baseUrl` is `https://api.openai.com/v1`. The convention is that
  `baseUrl` includes the API version segment (`/v1`); the adapter appends
  `/chat/completions`.
- `config.apiKey` is **required**. The constructor throws on missing/empty
  values — that's a config bug, not a runtime fall.
- Auth via `Authorization: Bearer ${apiKey}` header.

## Implementation gotchas

- **System messages stay in `messages[]`.** Unlike Anthropic (which forbids
  `role: 'system'` in `messages[]` and uses a top-level `system` field), OpenAI
  Chat Completions accepts `role: 'system'` natively. The adapter passes
  `request.messages` through verbatim.
- **`choices[0].message.content` can be `null`** when the model returns
  `finish_reason: 'tool_calls'`. The adapter coalesces to empty string —
  `LLMResponse.text` is always a `string`.
- **`max_tokens` is optional in the wire format** but the adapter defaults to
  4096; override via `request.maxOutputTokens`. (Some providers reject requests
  without it; including a default avoids surprises.)
- **429 maps to `BudgetExceededError`**, not `ProviderUnavailableError`. Same
  convention as the Anthropic adapter. Rate limits and quota errors are budget
  signals — the router should fall to a cheaper tier rather than keep retrying.
- **Tool calling, streaming, structured output**: capability flags are all
  `false` in v0.1 even though the OpenAI spec defines them. The adapter doesn't
  yet implement wire-level integration; those land in v0.4. A
  `requires.tools === true` request is rejected pre-HTTP with
  `CapabilityMismatchError`. Override `config.capability` per-instance if you
  know your provider supports a feature AND understand the adapter limitation.
- **No `openai` SDK dependency.** The adapter uses Node 24's built-in fetch.
  Keeps the dependency graph clean.
- **Cost defaults are `0`.** The generic adapter has no per-provider knowledge;
  presets (issue #7) populate realistic pricing. Users with custom base URLs
  should set `capability.costPerMillion*` explicitly or the policy can't enforce
  budgets correctly.
- **`baseUrl` trailing slash is normalized** before appending `/chat/completions`.
- **Timeout**: fixed 30s via `AbortController`. No per-request override in v0.1.

## Vendor neutrality

This package depends on `@tierfall/core` only — no `openai`, no
`@anthropic-ai/sdk`, nothing vendor-specific. Verified by `pnpm why` returning
nothing for those package names from `packages/core/`.

## Testing

Unit tests in `test/adapter.test.ts` with `jest.spyOn(global, 'fetch')`. 10 tests
cover happy path, system-stays-in-messages, tier-from-config, content-null
coalescing, four error mappings, capability gate, and missing apiKey.

No integration tests in v0.1 — real API calls cost actual money. The AC permits
env-gating ("integration tests gated on `OPENAI_API_KEY` or `DEEPSEEK_API_KEY`"),
which we honor by not adding to default CI. v0.4 can add env-gated tests when
streaming + tools land.

Tests import explicitly from `@jest/globals` because pnpm's strict hoisting
doesn't expose Jest's globals via `@types/jest`.

`presets.test.ts` stays red until issue #7 implements the five preset factories.

## Presets (closes #7)

The five blessed presets in `src/presets.ts` are pure config factories — no
HTTP, no side effects. Each returns a partial `OpenAICompatibleAdapterConfig`
sans `apiKey`; the caller supplies that at invocation time:

```ts
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';

const adapter = new OpenAICompatibleAdapter(
  presets.deepseek({
    apiKey: process.env.DEEPSEEK_API_KEY!,
  }),
);
```

**Override semantics:** top-level fields use shallow merge (override wins);
`capability` deep-merges one level so the user can replace a single capability
field without losing the preset's defaults for the others.

**Pricing values** in the presets are best-effort representative figures from
the implementation date. Each preset's TSDoc cites the provider's pricing-page
URL so future contributors know where to verify. When a vendor changes their
rate card, a preset-refresh PR updates the relevant values.

**Adding a new preset** requires:

1. Add a new field to `OpenAICompatiblePresets` interface in `src/presets.ts`
2. Add a new factory under `presets`
3. Add a per-preset test in `test/presets.test.ts` (shape + tier)
4. Update the `Object.keys(presets)` test to include the new name
5. Cite the pricing-source URL in the preset's TSDoc

## When changing this package

Run `pnpm --filter @tierfall/adapter-openai-compatible test`. The 10 adapter
unit tests must stay green. If you change the wire-shape mapping in
`src/adapter.ts` (e.g., adding a new field to `LLMResponse.usage`), update
`src/http.ts`'s `OpenAICompatibleChatResponse` type and add a matching unit
test.

If you update `DEFAULT_BASE_URL`, the happy-path test's URL assertion needs
matching update.
