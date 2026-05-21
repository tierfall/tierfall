# Anthropic Adapter Implementation — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#8 — feat(adapter-anthropic): implement complete() against Messages API](https://github.com/tierfall/tierfall/issues/8)
**Scope:** Replace `AnthropicAdapter.complete` skeleton with a real implementation against `POST /v1/messages`. Split into `adapter.ts` + new `http.ts` (same shape as the Ollama adapter from issue #5). Nine unit tests with mocked fetch; no integration tests for v0.1 (real Anthropic calls cost actual money).

---

## 1. Goal

Make the **premium-cloud** tier work. After this PR, a request flowing through a `Router([AnthropicAdapter])` produces real Claude output, or a typed fall error (`BudgetExceededError` on rate limit, `ProviderUnavailableError` on everything else).

This is the second adapter implementation. Together with Ollama (issue #5 just landed), it gives v0.1 two tiers of real LLM coverage — and stresses the `Adapter` interface enough to confirm vendor neutrality: Anthropic's API shape is meaningfully different from Ollama's (and from OpenAI Chat Completions), yet the adapter contract absorbs both cleanly.

## 2. Inputs

Constructor signature unchanged from scaffold:

```ts
interface AnthropicAdapterConfig {
  readonly baseUrl?: string; // default 'https://api.anthropic.com'
  readonly apiKey?: string; // REQUIRED (constructor throws if missing)
  readonly model: string; // required, e.g. 'claude-sonnet-4-7'
  readonly capability?: Partial<AdapterCapability>;
}
```

`apiKey` REQUIREMENT is the first material difference from Ollama (which accepts but ignores it).

## 3. HTTP layer (`packages/adapter-anthropic/src/http.ts` — new file)

```ts
import { BudgetExceededError, ProviderUnavailableError } from '@tierfall/core';

export interface AnthropicMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface AnthropicMessagesRequest {
  readonly model: string;
  readonly messages: readonly AnthropicMessage[];
  readonly max_tokens: number;
  readonly system?: string;
}

export interface AnthropicContentBlock {
  readonly type: string;
  readonly text?: string;
}

export interface AnthropicMessagesResponse {
  readonly id: string;
  readonly type: string;
  readonly role: string;
  readonly model: string;
  readonly content: readonly AnthropicContentBlock[];
  readonly stop_reason?: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;
const ANTHROPIC_VERSION = '2023-06-01';

export async function postMessages(
  baseUrl: string,
  apiKey: string,
  body: AnthropicMessagesRequest,
): Promise<AnthropicMessagesResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ProviderUnavailableError(
      `Anthropic request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable body>');
    if (response.status === 429) {
      throw new BudgetExceededError(`Anthropic 429 rate limit / quota: ${text}`);
    }
    throw new ProviderUnavailableError(
      `Anthropic ${String(response.status)} ${response.statusText}: ${text}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new ProviderUnavailableError(
      `Anthropic returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!isValidMessagesResponse(data)) {
    throw new ProviderUnavailableError(
      `Anthropic returned unexpected shape: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

function isValidMessagesResponse(value: unknown): value is AnthropicMessagesResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.content)) return false;
  if (typeof obj.usage !== 'object' || obj.usage === null) return false;
  const usage = obj.usage as Record<string, unknown>;
  return typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number';
}
```

**Key behaviors:**

- 30s timeout via AbortController
- 429 → `BudgetExceededError` (deviation from existing CLAUDE.md; convention from #6's AC)
- All other 4xx/5xx + network + malformed JSON + shape violation → `ProviderUnavailableError`
- Returns the raw response narrowed to the fields the adapter consumes

## 4. Adapter (`packages/adapter-anthropic/src/adapter.ts` — rewrite)

```ts
import {
  CapabilityMismatchError,
  type Adapter,
  type AdapterCapability,
  type LLMRequest,
  type LLMResponse,
  type Tier,
} from '@tierfall/core';
import { postMessages } from './http.js';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_INPUT_COST_PER_MTOK = 3;
const DEFAULT_OUTPUT_COST_PER_MTOK = 15;

export interface AnthropicAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

export class AnthropicAdapter implements Adapter {
  readonly name = 'anthropic';
  readonly tier: Tier = 'premium-cloud';
  readonly capability: AdapterCapability;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(config: AnthropicAdapterConfig) {
    if (!config.apiKey) {
      throw new Error(
        "AnthropicAdapter requires `apiKey` in config (Anthropic's Messages API authenticates via x-api-key header).",
      );
    }
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.capability = {
      contextWindowTokens: 200_000,
      // v0.1: false. v0.4 flips alongside wire-level tool calling.
      supportsTools: false,
      supportsStreaming: false,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: DEFAULT_INPUT_COST_PER_MTOK,
      costPerMillionOutputTokens: DEFAULT_OUTPUT_COST_PER_MTOK,
      ...config.capability,
    };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (request.requires?.tools === true) {
      throw new CapabilityMismatchError(
        'Anthropic adapter does not support tool calling yet — landing in v0.4 alongside wire-level integration',
      );
    }

    // Extract system messages → top-level system field; remaining messages
    // go into the messages array. Anthropic forbids 'system' role in messages[].
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const otherMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const data = await postMessages(this.baseUrl, this.apiKey, {
      model: this.model,
      messages: otherMessages,
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      ...(systemMessages.length > 0
        ? { system: systemMessages.map((m) => m.content).join('\n\n') }
        : {}),
    });

    // Anthropic returns content as a block array. v0.1 extracts text from
    // type:'text' blocks and ignores everything else (tool_use, etc.).
    const text = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');

    const inputCost =
      ((this.capability.costPerMillionInputTokens ?? 0) / 1_000_000) * data.usage.input_tokens;
    const outputCost =
      ((this.capability.costPerMillionOutputTokens ?? 0) / 1_000_000) * data.usage.output_tokens;

    return {
      text,
      tier: this.tier,
      model: this.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        estimatedCostUSD: inputCost + outputCost,
      },
      fallChain: [],
    };
  }
}
```

## 5. Tests — 9 unit tests with mocked fetch

`packages/adapter-anthropic/test/adapter.test.ts` (rewrite):

| #   | Name                                                             | Setup                                              | Assertion                                                                                         |
| --- | ---------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | **happy path**                                                   | response with single text block + usage            | text concatenated correctly; cost computed via per-token × capability rates; tier/model populated |
| 2   | **system message extracted to top-level**                        | request includes role='system' messages            | fetch body's `system` field set correctly; `messages` array has no system role                    |
| 3   | **multiple text blocks concatenated; tool_use ignored**          | response content `[{text}, {tool_use}, {text}]`    | result text = block1.text + block3.text (tool_use silently skipped)                               |
| 4   | **HTTP 401 → ProviderUnavailableError**                          | fetch returns 401                                  | rejects `ProviderUnavailableError`; message includes `401` and body                               |
| 5   | **HTTP 429 → BudgetExceededError** (the convention)              | fetch returns 429                                  | rejects `BudgetExceededError`; message includes `429` and body                                    |
| 6   | **HTTP 5xx → ProviderUnavailableError**                          | fetch returns 503                                  | rejects `ProviderUnavailableError`                                                                |
| 7   | **Network error → ProviderUnavailableError**                     | fetch throws TypeError                             | rejects `ProviderUnavailableError`                                                                |
| 8   | **`requires.tools === true` → CapabilityMismatchError pre-HTTP** | request has `requires.tools: true`                 | rejects `CapabilityMismatchError`; fetch NOT called                                               |
| 9   | **Missing apiKey → constructor throws**                          | `new AnthropicAdapter({ model: 'x' })` (no apiKey) | constructor throws plain `Error` (a config bug — not a runtime fall)                              |

Reuse the `@jest/globals` import pattern proven in issue #5's PR — pnpm strict hoisting requires explicit import.

## 6. Files changed

| File                                              | Operation                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/adapter-anthropic/src/http.ts`          | Create                                                                                                      |
| `packages/adapter-anthropic/src/adapter.ts`       | Rewrite                                                                                                     |
| `packages/adapter-anthropic/src/index.ts`         | Unchanged                                                                                                   |
| `packages/adapter-anthropic/test/adapter.test.ts` | Rewrite (9 unit tests, mocked fetch)                                                                        |
| `packages/adapter-anthropic/package.json`         | Add `@jest/globals: 29.7.0` devDep                                                                          |
| `packages/adapter-anthropic/CLAUDE.md`            | Update — 429 maps to Budget (not ProviderUnavailable); capability flags v0.1 stance; system extraction note |
| `.changeset/feat-adapter-anthropic-implement.md`  | `@tierfall/core` minor (linked-mode)                                                                        |

No CI changes. No new top-level deps. No `@anthropic-ai/sdk`.

## 7. Commit plan

**4 commits** on `feat/adapter-anthropic-implement`:

1. **`feat(adapter-anthropic): add HTTP layer (postMessages)`** — `src/http.ts` + types + auth headers + 429 → BudgetExceededError mapping.
2. **`feat(adapter-anthropic): implement complete() + 9 unit tests`** — `src/adapter.ts` rewrite + tests + add `@jest/globals` devDep.
3. **`docs(adapter-anthropic): CLAUDE.md gotchas`** — update CLAUDE.md to match implementation (429 mapping, capability flags, system extraction, max_tokens default).
4. **`docs(adapter-anthropic): changeset`** — `.changeset/feat-adapter-anthropic-implement.md` minor bump.

## 8. Acceptance criteria mapping

| AC from issue #8                                                                                                                              | How met                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handles Anthropic's distinct message shape (system top-level; content as blocks)                                                              | §3 + §4 — system extraction in adapter; content-block concatenation in adapter                                                                                                                                                                                                                                                                                                                                        |
| Maps Anthropic errors to `ProviderUnavailableError` / `BudgetExceededError`                                                                   | §3 `postMessages`: 429 → Budget, all else → ProviderUnavailable. Tests #4–#7.                                                                                                                                                                                                                                                                                                                                         |
| Default capability matches `claude-sonnet-4-7` published characteristics (200K context, tools, streaming, structured output, current pricing) | **Deviation:** 200K context and pricing match. `supportsTools/Streaming/StructuredOutput` set to **false** for v0.1 — the adapter doesn't implement wire-level tool calling, streaming, or structured output. Setting these true would silently break requests passing through the policy filter. Will flip in v0.4 alongside implementation. Same conservative stance as Ollama (issue #5). Documented in CLAUDE.md. |
| Existing red test passes; add ≥3 tests covering happy path, message-shape translation, and error mapping                                      | 9 unit tests in §5: happy path, system extraction, multi-block content, 4 error mappings, capability gate, missing apiKey                                                                                                                                                                                                                                                                                             |
| CLAUDE.md updated with translation gotchas vs OpenAI                                                                                          | Commit 3 covers: system extraction, content blocks, 429 → BudgetExceededError, max_tokens required, no SDK                                                                                                                                                                                                                                                                                                            |
| Changeset added                                                                                                                               | Commit 4 — `@tierfall/core` minor (linked-mode bumps all four published packages)                                                                                                                                                                                                                                                                                                                                     |

## 9. Out of scope

- **Streaming** (`server-sent events` via `stream: true`) — v0.4 alongside Ollama streaming
- **Tool calling** — v0.4 alongside the shared tool-call translation layer
- **Structured output** (`tool_choice: { type: 'tool', name }` pattern) — v0.4
- **Prompt caching** (`cache_control` markers) — future optimization
- **`@anthropic-ai/sdk` dependency** — explicitly avoided (built-in fetch only)
- **Integration tests against the real API** — would burn credits on every CI run; v0.4 can add env-gated tests when streaming + tools land

## 10. Risks

- **Pricing drift.** $3/$15 per MTok for Claude Sonnet 4 family is my best-effort representative figure. Verify against the live rate card at execute time and adjust if Anthropic has shifted. Pricing is a `capability.costPerMillionInputTokens` value, so a user can override at construction.
- **`anthropic-version: 2023-06-01`.** Stable header version. If Anthropic deprecates it before v0.4 lands, the adapter will start returning errors — but they'll be 400 errors with a clear message, mapped to `ProviderUnavailableError` which the router falls cleanly past.
- **`requires.tools` rejected when AC says capability declares them supported.** Documented deviation; intentional conservatism. v0.4 alignment removes the discrepancy.

## 11. References

- Anthropic Messages API: https://docs.anthropic.com/en/api/messages
- Anthropic rate card: https://www.anthropic.com/pricing (verify at execute time)
- Ollama adapter spec (issue #5, just landed): `docs/superpowers/specs/2026-05-20-adapter-ollama-implementation-design.md` — same `http.ts` + `adapter.ts` split pattern
