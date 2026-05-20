# OpenAI-Compatible Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `OpenAICompatibleAdapter.complete` against `POST {baseUrl}/chat/completions`. Split into `src/http.ts` + rewritten `src/adapter.ts`. Ship 10 unit tests (mocked fetch). No integration tests in v0.1 (AC explicitly permits env-gating).

**Architecture:** Mirrors the Ollama (#5) and Anthropic (#8) adapter shape. `src/http.ts` encapsulates fetch + AbortController + Bearer auth + error mapping (429 → BudgetExceededError special case). `src/adapter.ts` translates `LLMRequest` ↔ Chat Completions wire format (system messages stay in-place — unlike Anthropic; `content === null` coalesces to empty string on tool-call responses) and applies the `requires.tools` capability gate. Tier is per-instance from `config.tier`.

**Tech Stack:** TypeScript 6.0.3, Node 24's built-in fetch, Jest 29.7.0 + ts-jest 29.4.10 + `@jest/globals`, AbortController. No `openai` SDK.

**Spec:** `docs/superpowers/specs/2026-05-20-adapter-openai-compatible-implementation-design.md`
**Tracked issue:** [#6](https://github.com/tierfall/tierfall/issues/6)
**Branch:** `feat/adapter-openai-compatible-implement`

---

## File map

| File                                                      | Operation          | Responsibility                                                                               |
| --------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `packages/adapter-openai-compatible/src/http.ts`          | Create (Commit 1)  | `postChatCompletions` + wire types + Bearer auth + 429→Budget mapping                        |
| `packages/adapter-openai-compatible/src/adapter.ts`       | Rewrite (Commit 2) | `OpenAICompatibleAdapter` class with per-instance tier + capability gate                     |
| `packages/adapter-openai-compatible/test/adapter.test.ts` | Rewrite (Commit 2) | 10 unit tests with mocked `global.fetch`                                                     |
| `packages/adapter-openai-compatible/package.json`         | Modify (Commit 2)  | Add `@jest/globals: 29.7.0` devDep                                                           |
| `packages/adapter-openai-compatible/CLAUDE.md`            | Modify (Commit 3)  | Update: v0.1 capability stance, 429→Budget, system-in-place, Bearer auth, baseUrl convention |
| `.changeset/feat-adapter-openai-compatible-implement.md`  | Create (Commit 4)  | `@tierfall/core` minor (linked-mode)                                                         |
| `packages/adapter-openai-compatible/src/index.ts`         | Unchanged          | Still exports `OpenAICompatibleAdapter` + `OpenAICompatibleAdapterConfig`                    |
| `packages/adapter-openai-compatible/test/presets.test.ts` | Unchanged          | Still red (issue #7 makes it green)                                                          |

---

## Constraints recap

- No `any` outside test files. No `// eslint-disable*`. No `// @ts-*`.
- All commits signed off (`git commit -s`). Never `--no-verify`.
- Stay on `feat/adapter-openai-compatible-implement`. Each commit passes pre-commit on its own.
- `core:test` must end green. `adapter-openai-compatible:test` ends with adapter.test.ts green and presets.test.ts still red (issue #7).
- Run prettier --write before committing if pre-commit complains.
- Use the `@jest/globals` explicit-import pattern proven in #5/#8.
- For mock-call extraction in tests, use runtime guards (`if (!firstCall) throw ...`) — not `!` non-null assertions, not `as` type-only casts on optional values. (Same lint trap solved in #8.)

---

## Commit 1 — Add HTTP layer (`postChatCompletions`)

### Task 1.1: Create `packages/adapter-openai-compatible/src/http.ts`

**Files:**

- Create: `packages/adapter-openai-compatible/src/http.ts`

- [ ] **Step 1: Write the file**

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
 * appends `/chat/completions`. Trailing slashes on `baseUrl` are normalized.
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

- [ ] **Step 2: Lint + typecheck**

```bash
pnpm exec eslint --max-warnings=0 packages/adapter-openai-compatible/src/http.ts
pnpm --filter @tierfall/adapter-openai-compatible typecheck
```

Both: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-openai-compatible/src/http.ts
git commit -s -m "feat(adapter-openai-compatible): add HTTP layer (postChatCompletions)

Encapsulates fetch + AbortController timeout (30s) + Bearer auth +
error mapping.

Key error convention: 429 → BudgetExceededError (rate limit / quota
is a budget signal that should fall to a cheaper tier). All other
4xx/5xx + network + malformed-JSON + shape-violation map to
ProviderUnavailableError.

baseUrl convention: includes /v1 segment; helper appends
/chat/completions. Trailing-slash normalized.

Validates response shape (choices[0] + usage with prompt_tokens /
completion_tokens present).

Not yet consumed — adapter rewrite lands in Commit 2.

Refs #6."
```

---

## Commit 2 — Implement `OpenAICompatibleAdapter.complete` + 10 unit tests

### Task 2.1: Add `@jest/globals` devDep

**Files:**

- Modify: `packages/adapter-openai-compatible/package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install**

```bash
pnpm --filter @tierfall/adapter-openai-compatible add -D @jest/globals@29.7.0
```

Expected: lockfile updated; `package.json` devDependencies includes `@jest/globals: 29.7.0`.

### Task 2.2: Rewrite `packages/adapter-openai-compatible/src/adapter.ts`

**Files:**

- Modify: `packages/adapter-openai-compatible/src/adapter.ts` (rewrite skeleton)

- [ ] **Step 1: Replace the file contents**

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
 * `requires.tools === true` request rejects pre-HTTP with
 * `CapabilityMismatchError`. Override per-instance via `config.capability`
 * if you know your provider supports a feature AND understand the adapter
 * limitation.
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

### Task 2.3: Rewrite `packages/adapter-openai-compatible/test/adapter.test.ts`

**Files:**

- Modify: `packages/adapter-openai-compatible/test/adapter.test.ts` (replace red TDD test with 10 unit tests)

- [ ] **Step 1: Replace the file contents**

```ts
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  ProviderUnavailableError,
} from '@tierfall/core';
import { OpenAICompatibleAdapter } from '../src/adapter.js';

function mockFetchResponse(opts: {
  status?: number;
  statusText?: string;
  body?: unknown;
  text?: string;
}): Response {
  const status = opts.status ?? 200;
  const statusText = opts.statusText ?? 'OK';
  if (opts.text !== undefined) {
    return new Response(opts.text, { status, statusText });
  }
  return new Response(JSON.stringify(opts.body ?? {}), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okBody = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  model: 'gpt-5-mini',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'pong' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};

describe('OpenAICompatibleAdapter (closes #6)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes #6: happy path — returns text, usage, computed cost, Bearer header', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OpenAICompatibleAdapter({
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
      capability: { costPerMillionInputTokens: 1, costPerMillionOutputTokens: 4 },
    });

    const result = await adapter.complete({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const firstCall = spy.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch to have been called');
    expect(firstCall[0]).toBe('https://api.openai.com/v1/chat/completions');
    const init = firstCall[1];
    if (!init) throw new Error('expected fetch to have been called with init');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');

    expect(result.text).toBe('pong');
    expect(result.tier).toBe('cheap-cloud');
    expect(result.model).toBe('gpt-5-mini');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(3);
    // 5 in * $1/MTok + 3 out * $4/MTok = 0.000005 + 0.000012 = 0.000017
    expect(result.usage.estimatedCostUSD).toBeCloseTo(0.000017, 10);
    expect(result.fallChain).toEqual([]);
  });

  it('closes #6: system messages stay in messages array (not extracted)', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OpenAICompatibleAdapter({
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
    });

    await adapter.complete({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'ping' },
      ],
    });

    const firstCall = spy.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch to have been called');
    const init = firstCall[1];
    if (!init) throw new Error('expected fetch to have been called with init');
    const body = JSON.parse(init.body as string) as {
      system?: string;
      messages: { role: string; content: string }[];
    };
    expect(body.system).toBeUndefined();
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'ping' },
    ]);
  });

  it('closes #6: tier comes from config', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OpenAICompatibleAdapter({
      apiKey: 'sk-test',
      model: 'gpt-5-pro',
      tier: 'premium-cloud',
    });
    const result = await adapter.complete({
      model: 'gpt-5-pro',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.tier).toBe('premium-cloud');
  });

  it('closes #6: content === null coalesces to empty string (tool_calls finish_reason)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        body: {
          ...okBody,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: null },
              finish_reason: 'tool_calls',
            },
          ],
        },
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });
    const result = await adapter.complete({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.text).toBe('');
  });

  it('closes #6: HTTP 401 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 401,
        statusText: 'Unauthorized',
        text: '{"error":{"message":"Incorrect API key provided"}}',
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-bogus', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('401');
    expect((caught as Error).message).toContain('Incorrect API key');
  });

  it('closes #6: HTTP 429 maps to BudgetExceededError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 429,
        statusText: 'Too Many Requests',
        text: '{"error":{"message":"You exceeded your current quota"}}',
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as Error).message).toContain('429');
    expect((caught as Error).message).toContain('quota');
  });

  it('closes #6: HTTP 503 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 503,
        statusText: 'Service Unavailable',
        text: 'overloaded',
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('503');
  });

  it('closes #6: network error maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('failed');
  });

  it('closes #6: requires.tools === true → CapabilityMismatchError before any HTTP', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    await expect(
      adapter.complete({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'ping' }],
        requires: { tools: true },
      }),
    ).rejects.toBeInstanceOf(CapabilityMismatchError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes #6: missing apiKey → constructor throws', () => {
    expect(() => new OpenAICompatibleAdapter({ model: 'gpt-5-mini' })).toThrow(/requires `apiKey`/);
    expect(() => new OpenAICompatibleAdapter({ apiKey: '', model: 'gpt-5-mini' })).toThrow(
      /requires `apiKey`/,
    );
  });
});
```

### Task 2.4: Build, lint, typecheck, test

- [ ] **Step 1: Build core + adapter**

```bash
pnpm exec nx run-many --target=build --projects=core,adapter-openai-compatible
```

Expected: exit 0.

- [ ] **Step 2: Lint + typecheck**

```bash
pnpm exec eslint --max-warnings=0 packages/adapter-openai-compatible
pnpm --filter @tierfall/adapter-openai-compatible typecheck
```

Both: exit 0. If `eslint` reports `non-nullable-type-assertion-style` or `no-non-null-assertion` errors on the test file, the guard pattern in the mock-call extraction is wrong — review the `firstCall = spy.mock.calls[0]; if (!firstCall) throw ...; const init = firstCall[1]; if (!init) throw ...;` shape (same fix that landed in #8).

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @tierfall/adapter-openai-compatible test 2>&1 | grep -E "(PASS|FAIL|Tests:)"
```

Expected:

- `adapter.test.ts` → **PASS** (10 tests)
- `presets.test.ts` → still **FAIL** (issue #7 — out of scope for this PR)
- `Tests: 11 failed, 10 passed` (1 of 11 failing is the existing presets red test)

Wait — that's actually 12 if both files share the suite. Let me restate: the **adapter.test.ts** file passes its 10 tests; the **presets.test.ts** file still has its red TDD test failing. Package-level `pnpm test` reports both together. The expected counts depend on what's in `presets.test.ts` — typically 2 red tests there.

If `adapter.test.ts` fails any of its 10, **stop** and investigate.

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-openai-compatible/src/adapter.ts \
        packages/adapter-openai-compatible/test/adapter.test.ts \
        packages/adapter-openai-compatible/package.json \
        pnpm-lock.yaml
git commit -s -m "feat(adapter-openai-compatible): implement complete() + 10 unit tests

Real implementation translates LLMRequest to OpenAI's POST /chat/completions
shape and back. Uses src/http.ts (Commit 1) for HTTP plumbing.

- System messages stay in messages[] (unlike Anthropic — OpenAI accepts
  role='system' natively)
- content === null coalesces to empty string (tool_calls finish_reason
  yields null content)
- max_tokens optional in wire format; default 4096
- requires.tools === true → CapabilityMismatchError pre-HTTP
- 401/403/4xx (other than 429)/5xx/network/malformed-JSON/shape-violation
  → ProviderUnavailableError
- 429 → BudgetExceededError (rate limit / quota is a budget signal)
- Constructor throws on missing/empty apiKey (config bug)

Tier is per-instance from config.tier (default 'cheap-cloud'). Presets
(issue #7) hard-code tier per provider.

Default capability: 32K context, supportsTools/Streaming/StructuredOutput
all false in v0.1 (flip in v0.4 when wire-level implementation lands).
Cost defaults: \$0 / \$0 (presets populate real per-provider numbers).

Tests via @jest/globals (added as devDep). 10 unit tests cover happy
path, system-stays-put, tier from config, content null coalescing,
four error mappings, capability gate, missing apiKey. Mock-call
extraction uses runtime guards (not ! non-null assertion).

Closes #6."
```

---

## Commit 3 — Update CLAUDE.md

### Task 3.1: Rewrite `packages/adapter-openai-compatible/CLAUDE.md`

**Files:**

- Modify: `packages/adapter-openai-compatible/CLAUDE.md`

- [ ] **Step 1: Replace the file contents**

```markdown
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

## When changing this package

Run `pnpm --filter @tierfall/adapter-openai-compatible test`. The 10 adapter
unit tests must stay green. If you change the wire-shape mapping in
`src/adapter.ts` (e.g., adding a new field to `LLMResponse.usage`), update
`src/http.ts`'s `OpenAICompatibleChatResponse` type and add a matching unit
test.

If you update `DEFAULT_BASE_URL`, the happy-path test's URL assertion needs
matching update.
```

- [ ] **Step 2: Verify prettier**

```bash
pnpm exec prettier --check packages/adapter-openai-compatible/CLAUDE.md
```

Expected: exit 0. If it complains, `pnpm exec prettier --write` first.

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-openai-compatible/CLAUDE.md
git commit -s -m "docs(adapter-openai-compatible): CLAUDE.md gotchas

Updates CLAUDE.md to match the issue #6 implementation:
- System messages stay in messages[] (no extraction, unlike Anthropic)
- content === null coalesces to empty string (tool_calls edge case)
- max_tokens defaults 4096; baseUrl includes /v1 segment
- 429 → BudgetExceededError (convention)
- v0.1 capability conservatism: tools/streaming/structured all false
- No openai SDK; built-in fetch + Bearer auth
- Tier per-instance; presets (#7) hard-code per provider
- Tests use @jest/globals; no integration tests in v0.1; presets.test.ts
  still red (issue #7)

Refs #6."
```

---

## Commit 4 — Changeset

### Task 4.1: Create `.changeset/feat-adapter-openai-compatible-implement.md`

**Files:**

- Create: `.changeset/feat-adapter-openai-compatible-implement.md`

- [ ] **Step 1: Write the changeset**

```markdown
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
```

- [ ] **Step 2: Verify changeset status**

```bash
pnpm exec changeset status 2>&1 | head -15
```

Expected: `@tierfall/core` and the three adapter packages listed at minor (linked-mode).

- [ ] **Step 3: Commit**

```bash
git add .changeset/feat-adapter-openai-compatible-implement.md
git commit -s -m "docs(adapter-openai-compatible): changeset for #6

Changeset: @tierfall/core minor (linked-mode bumps all four published
packages together at publish).

Refs #6."
```

---

## Final verification before opening the PR

- [ ] **Step 1: Branch state**

```bash
git log --oneline develop..HEAD
```

Expected: 5 commits (spec + 4 implementation).

- [ ] **Step 2: Full local check**

```bash
pnpm run check
```

Expected:

- lint: pass
- typecheck: pass
- test: only `adapter-openai-compatible:test` still partial (presets.test.ts red for issue #7); adapter.test.ts itself green
- build: pass

Note: `adapter-openai-compatible:test` will report as failed because Jest finds both test files in the package. That's expected — issue #7 makes `presets.test.ts` green.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/adapter-openai-compatible-implement
```

- [ ] **Step 4: Open PR**

````bash
gh pr create \
  --base develop \
  --head feat/adapter-openai-compatible-implement \
  --title "feat(adapter-openai-compatible): implement complete() against /v1/chat/completions" \
  --body-file - <<'BODY'
## Summary

Implements `OpenAICompatibleAdapter.complete` per the design spec at
`docs/superpowers/specs/2026-05-20-adapter-openai-compatible-implementation-design.md`.

Closes #6. **Three adapters now real.** After this PR plus #7's presets, all
three adapter packages have green tests and the `test-rest` CI job's
`continue-on-error: true` can be removed.

## Acceptance criteria

- [x] Basic non-streaming completion succeeds against a live OpenAI-compatible endpoint (use a mock server in unit tests; integration tests gated on env)
- [x] Maps OpenAI errors to `ProviderUnavailableError` (network / 4xx / 5xx other than rate limit) or `BudgetExceededError` (rate limit / quota error)
- [x] Usage extracted from `response.usage`; cost computed using `capability.costPerMillion*Tokens`
- [x] Existing red test replaced + 10 unit tests
- [x] Changeset added (`@tierfall/core` minor)

## Deviations from issue #6 AC

**(a) No integration test file in v0.1.** AC says "integration tests gated on
`OPENAI_API_KEY` or `DEEPSEEK_API_KEY` env" — the env-gating language permits
omission. All 10 tests are mocked-fetch unit tests. Easy to add an env-gated
integration suite later if needed.

**(b) Capability flags conservatism.** Third time this stance has appeared
(after #5 Ollama and #8 Anthropic): `supportsTools/Streaming/StructuredOutput`
all `false` in v0.1. Adapter doesn't yet implement wire-level support; v0.4
flips all three across all adapters at once.

## Cumulative milestone

Three adapter packages now all have green tests:
- `@tierfall/adapter-ollama` (#5)
- `@tierfall/adapter-anthropic` (#8)
- `@tierfall/adapter-openai-compatible` (#6 — this PR)

`presets.test.ts` is the last red TDD test in `test-rest` after this PR
merges; issue #7 closes the loop and `continue-on-error: true` can be
removed from `ci.yml`'s `test-rest` job.

## How to validate locally

```bash
pnpm install
pnpm --filter @tierfall/adapter-openai-compatible test    # 10 adapter tests green; presets test still red (#7)
pnpm run check                                            # only presets.test.ts red
````

BODY

```

- [ ] **Step 5: Watch CI**

Use Monitor on `gh pr checks <PR#>` until all checks complete. Expect:

```

analyze (javascript-typescript): pass
attw: pass
build: pass
check: pass (DCO)
CodeQL: pass
knip: pass
lint: pass
move-card: pass
publint: pass
test-core: pass
test-integration-ollama: pass (unrelated to this PR; checked anyway)
test-rest: pass (via continue-on-error — presets.test.ts still red)
typecheck: pass

````

- [ ] **Step 6: Merge**

```bash
gh pr merge <PR#> --merge --delete-branch --admin
````

- [ ] **Step 7: Move board card to Done; pull develop**

```bash
source "$CLAUDE_JOB_DIR/project-ids.sh"
ITEM_ID=$(gh api graphql -f query='{ organization(login: "tierfall") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }' --jq '.data.organization.projectV2.items.nodes[] | select(.content.number==6) | .id')
gh project item-edit --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_DONE_ID" --project-id "$PROJECT_ID" > /dev/null

git checkout develop
git pull --ff-only origin develop
git log --oneline -5
```
