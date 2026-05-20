# OpenAI-Compatible Adapter Implementation — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#6 — feat(adapter-openai-compatible): implement complete() against /v1/chat/completions](https://github.com/tierfall/tierfall/issues/6)
**Scope:** Replace `OpenAICompatibleAdapter.complete` skeleton with a real implementation against `POST {baseUrl}/chat/completions`. Split into `adapter.ts` + new `http.ts` (same shape as #5/#8). Ten unit tests with mocked fetch. No integration tests in v0.1 (AC explicitly says env-gated, which we honor by not adding to default CI).

---

## 1. Goal

Make the **OpenAI-compatible** adapter work — covering OpenAI itself, Groq, DeepSeek, Cerebras, OpenRouter, vLLM, LM Studio, and any other vendor that speaks the OpenAI Chat Completions wire format.

This completes the v0.1 adapter trio. After this PR (and #7's presets), all three adapter packages have green tests and the `test-rest` job's `continue-on-error: true` can be removed.

## 2. Inputs

Constructor signature unchanged from scaffold:

```ts
interface OpenAICompatibleAdapterConfig {
  readonly baseUrl?: string; // default 'https://api.openai.com/v1'
  readonly apiKey?: string; // REQUIRED (constructor throws if missing)
  readonly model: string; // required, e.g. 'gpt-5-mini' or 'deepseek-chat'
  readonly tier?: Tier; // default 'cheap-cloud'; presets override
  readonly capability?: Partial<AdapterCapability>;
}
```

**`apiKey` is required.** Same enforcement as Anthropic — constructor throws on missing/empty values.

**`tier` is per-instance.** Different from #5 (Ollama always on-device) and #8 (Anthropic always premium). This adapter's tier varies by provider; the user passes it (or uses a preset from #7).

## 3. HTTP layer (`packages/adapter-openai-compatible/src/http.ts` — new file)

```ts
import { BudgetExceededError, ProviderUnavailableError } from '@tierfall/core';

export interface OpenAICompatibleMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface OpenAICompatibleChatRequest {
  readonly model: string;
  readonly messages: readonly OpenAICompatibleMessage[];
  readonly max_tokens?: number;
  readonly stream: false;
}

export interface OpenAICompatibleChatChoice {
  readonly index: number;
  readonly message: { readonly role: string; readonly content: string | null };
  readonly finish_reason?: string;
}

export interface OpenAICompatibleChatResponse {
  readonly id: string;
  readonly object: string;
  readonly model: string;
  readonly choices: readonly OpenAICompatibleChatChoice[];
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens?: number;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * POST {baseUrl}/chat/completions against an OpenAI-compatible endpoint.
 * Maps every failure into the canonical fall errors:
 * - 429 (rate limit / quota) → BudgetExceededError
 * - Other 4xx/5xx + network + malformed-JSON + shape-violation → ProviderUnavailableError
 *
 * Times out at 30s via AbortController. Returns the raw response narrowed
 * to the fields the adapter consumes.
 *
 * `baseUrl` should include the API version segment (e.g. `/v1`); the helper
 * appends `/chat/completions`.
 */
export async function postChatCompletions(
  baseUrl: string,
  apiKey: string,
  body: OpenAICompatibleChatRequest,
): Promise<OpenAICompatibleChatResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ProviderUnavailableError(
      `OpenAI-compatible request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable body>');
    if (response.status === 429) {
      throw new BudgetExceededError(`OpenAI-compatible 429 rate limit / quota: ${text}`);
    }
    throw new ProviderUnavailableError(
      `OpenAI-compatible ${String(response.status)} ${response.statusText}: ${text}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new ProviderUnavailableError(
      `OpenAI-compatible returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!isValidChatResponse(data)) {
    throw new ProviderUnavailableError(
      `OpenAI-compatible returned unexpected shape: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

function isValidChatResponse(value: unknown): value is OpenAICompatibleChatResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.choices)) return false;
  if (obj.choices.length === 0) return false;
  if (typeof obj.usage !== 'object' || obj.usage === null) return false;
  const usage = obj.usage as Record<string, unknown>;
  return typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number';
}
```

## 4. Adapter (`packages/adapter-openai-compatible/src/adapter.ts` — rewrite)

```ts
import {
  CapabilityMismatchError,
  type Adapter,
  type AdapterCapability,
  type LLMRequest,
  type LLMResponse,
  type Tier,
} from '@tierfall/core';
import { postChatCompletions } from './http.js';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export interface OpenAICompatibleAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly tier?: Tier;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * Adapter for any OpenAI-compatible Chat Completions API: OpenAI, Groq,
 * DeepSeek, Cerebras, OpenRouter, vLLM, LM Studio, and most self-hosted
 * inference servers.
 *
 * Unlike Anthropic, system messages stay in the `messages` array — OpenAI
 * accepts `role: 'system'` natively.
 *
 * **Tier is per-instance.** Defaults to `'cheap-cloud'`; pass `config.tier`
 * to override, or use a preset from `@tierfall/adapter-openai-compatible/presets`
 * (issue #7) for blessed provider configurations.
 *
 * **API key required.** OpenAI-compatible endpoints authenticate via Bearer.
 * The constructor throws if `config.apiKey` is missing.
 *
 * **v0.1 capability conservatism.** `supportsTools`, `supportsStreaming`,
 * and `supportsStructuredOutput` are `false` by default. The adapter doesn't
 * yet implement wire-level support for any of them; those land in v0.4. A
 * `requires.tools === true` request rejects pre-HTTP with `CapabilityMismatchError`.
 * Override per-instance via `config.capability` if you know your provider
 * supports a feature AND understand the adapter limitation.
 */
export class OpenAICompatibleAdapter implements Adapter {
  readonly name = 'openai-compatible';
  readonly tier: Tier;
  readonly capability: AdapterCapability;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(config: OpenAICompatibleAdapterConfig) {
    if (config.apiKey === undefined || config.apiKey === '') {
      throw new Error(
        'OpenAICompatibleAdapter requires `apiKey` in config (authenticated via Authorization: Bearer header).',
      );
    }
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.tier = config.tier ?? 'cheap-cloud';
    this.capability = {
      contextWindowTokens: 32_768,
      supportsTools: false,
      supportsStreaming: false,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: 0,
      costPerMillionOutputTokens: 0,
      ...config.capability,
    };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (request.requires?.tools === true) {
      throw new CapabilityMismatchError(
        'OpenAI-compatible adapter does not support tool calling yet — landing in v0.4',
      );
    }

    const data = await postChatCompletions(this.baseUrl, this.apiKey, {
      model: this.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      stream: false,
    });

    const firstChoice = data.choices[0];
    const text = firstChoice?.message.content ?? '';

    const inputCost =
      ((this.capability.costPerMillionInputTokens ?? 0) / 1_000_000) * data.usage.prompt_tokens;
    const outputCost =
      ((this.capability.costPerMillionOutputTokens ?? 0) / 1_000_000) *
      data.usage.completion_tokens;

    return {
      text,
      tier: this.tier,
      model: this.model,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        estimatedCostUSD: inputCost + outputCost,
      },
      fallChain: [],
    };
  }
}
```

## 5. Tests — 10 unit tests with mocked fetch

Replace existing red test in `packages/adapter-openai-compatible/test/adapter.test.ts`.

| #   | Name                                                             | Lock-in                                                                                                               |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **happy path**                                                   | request URL (`{baseUrl}/chat/completions`), headers (`Authorization: Bearer ...`), response parsing, cost computation |
| 2   | **system messages stay in `messages[]`**                         | distinction from Anthropic — no extraction                                                                            |
| 3   | **tier from config**                                             | `new OpenAICompatibleAdapter({ ..., tier: 'premium-cloud' })` → `result.tier === 'premium-cloud'`                     |
| 4   | **`content === null` coalesces to empty string**                 | the tool-calls edge case (when `finish_reason === 'tool_calls'`, `content` is null)                                   |
| 5   | **HTTP 401 → ProviderUnavailableError**                          | auth failure mapping                                                                                                  |
| 6   | **HTTP 429 → BudgetExceededError**                               | budget convention                                                                                                     |
| 7   | **HTTP 503 → ProviderUnavailableError**                          | server failure mapping                                                                                                |
| 8   | **Network error → ProviderUnavailableError**                     | offline behavior                                                                                                      |
| 9   | **`requires.tools === true` → CapabilityMismatchError pre-HTTP** | capability gate                                                                                                       |
| 10  | **Missing apiKey → constructor throws**                          | config bug catch                                                                                                      |

`presets.test.ts` is untouched in this PR — it stays red (issue #7 makes it green).

## 6. Files changed

| File                                                      | Operation                                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/adapter-openai-compatible/src/http.ts`          | Create                                                                                                   |
| `packages/adapter-openai-compatible/src/adapter.ts`       | Rewrite                                                                                                  |
| `packages/adapter-openai-compatible/src/index.ts`         | Unchanged                                                                                                |
| `packages/adapter-openai-compatible/test/adapter.test.ts` | Rewrite (10 unit tests, mocked fetch)                                                                    |
| `packages/adapter-openai-compatible/package.json`         | Add `@jest/globals: 29.7.0` devDep                                                                       |
| `packages/adapter-openai-compatible/CLAUDE.md`            | Update — v0.1 capability stance, 429 mapping, no-system-extraction note, Bearer auth, baseUrl convention |
| `.changeset/feat-adapter-openai-compatible-implement.md`  | `@tierfall/core` minor (linked-mode)                                                                     |

No CI changes. No new top-level deps. No `openai` SDK dependency.

## 7. Commit plan

**4 commits**, same shape as #5/#8:

1. **`feat(adapter-openai-compatible): add HTTP layer (postChatCompletions)`** — `src/http.ts` + types + Bearer auth + 429 mapping.
2. **`feat(adapter-openai-compatible): implement complete() + 10 unit tests`** — `src/adapter.ts` rewrite + tests + `@jest/globals` devDep.
3. **`docs(adapter-openai-compatible): CLAUDE.md gotchas`** — update CLAUDE.md.
4. **`docs(adapter-openai-compatible): changeset`** — `.changeset/feat-adapter-openai-compatible-implement.md` minor bump.

## 8. Acceptance criteria mapping

| AC from issue #6                                                                                                                                                                           | How met                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic non-streaming completion succeeds against a live OpenAI-compatible endpoint (use a mock server in unit tests; integration tests gated on `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` env) | §5 unit tests use mocked `fetch`. **No integration test file in v0.1** — AC's "gated on env" language permits omission; can add env-gated tests in a later PR if specific need arises. |
| Maps OpenAI errors to `ProviderUnavailableError` (network / 4xx / 5xx other than rate limit) or `BudgetExceededError` (rate limit / quota error)                                           | §3 `postChatCompletions`: 429 → Budget; rest → ProviderUnavailable. Tests #5–#8.                                                                                                       |
| Usage extracted from `response.usage`; cost computed using `capability.costPerMillion*Tokens`                                                                                              | §4 adapter: `prompt_tokens`/`completion_tokens` → `inputTokens`/`outputTokens`; cost = tokens × `capability.costPerMillion*` ÷ 1M. Test #1.                                            |
| Existing red test passes + ≥3 tests covering happy path, network error, and quota error                                                                                                    | 10 unit tests in §5 (well over the requirement)                                                                                                                                        |
| Changeset added                                                                                                                                                                            | Commit 4 — `@tierfall/core` minor (linked-mode bumps all four published packages)                                                                                                      |

## 9. Out of scope

- **Streaming** (`stream: true` + SSE parsing) — v0.4
- **Tool calling** (`tools` parameter + `tool_calls` block handling) — v0.4
- **Structured output** (`response_format: { type: 'json_object' }` or `json_schema`) — v0.4
- **Multimodal content** (content as arrays of `{type, text/image_url, ...}` parts) — future
- **Logprobs / token-level streaming** — future
- **`openai` SDK dependency** — explicitly avoided; built-in fetch only
- **Integration tests in default CI** — burns API credits per PR; AC's env-gating supports omission

## 10. Risks

- **`baseUrl` convention inconsistency** between providers. OpenAI's official endpoint ends with `/v1`; some self-hosted gateways serve directly from `/`. The adapter trusts the user-provided `baseUrl` verbatim (just trims trailing slash, then appends `/chat/completions`). Presets (#7) hard-code the correct shape per provider.
- **Response shape variance.** Some OpenAI-compat providers (older vLLM builds, certain proxies) omit fields. The shape validator only requires `choices[0]` + `usage.{prompt,completion}_tokens` — that's the minimum to produce a valid `LLMResponse`. Other fields (`stop_reason`, `id`, `model`) are extracted defensively.
- **Pricing defaults of `$0`.** Adapter-level default is free; presets (#7) populate real numbers per provider. Users with a custom base URL should set `capability.costPerMillion*` explicitly or the policy won't enforce budgets correctly.

## 11. References

- OpenAI Chat Completions API: https://platform.openai.com/docs/api-reference/chat
- Ollama adapter (#5): `docs/superpowers/specs/2026-05-20-adapter-ollama-implementation-design.md` — pattern source for `http.ts`+`adapter.ts` split
- Anthropic adapter (#8): `docs/superpowers/specs/2026-05-20-adapter-anthropic-implementation-design.md` — pattern source for 429→Budget convention and capability conservatism
