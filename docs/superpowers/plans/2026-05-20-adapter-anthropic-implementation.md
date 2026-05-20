# Anthropic Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `AnthropicAdapter.complete` against `POST /v1/messages`. Split into `src/http.ts` + rewritten `src/adapter.ts`. Ship 9 unit tests (mocked fetch). No integration tests for v0.1 (real API calls cost money).

**Architecture:** Mirrors issue #5's Ollama-adapter file split. `src/http.ts` encapsulates fetch + AbortController + x-api-key + anthropic-version headers + error mapping (with 429 → BudgetExceededError special case). `src/adapter.ts` translates `LLMRequest` ↔ Anthropic's Messages API shape (system extraction, content-block array → text concatenation) and applies the `requires.tools` capability gate. Unit tests `jest.spyOn` on `global.fetch`.

**Tech Stack:** TypeScript 6.0.3, Node 24's built-in fetch, Jest 29.7.0 + ts-jest 29.4.10 + `@jest/globals` (devDep — pnpm strict hoisting), AbortController. No `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-05-20-adapter-anthropic-implementation-design.md`
**Tracked issue:** [#8](https://github.com/tierfall/tierfall/issues/8)
**Branch:** `feat/adapter-anthropic-implement`

---

## File map

| File                                              | Operation          | Responsibility                                                                            |
| ------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `packages/adapter-anthropic/src/http.ts`          | Create (Commit 1)  | `postMessages` helper + Anthropic wire types + 429→Budget mapping + error mapping         |
| `packages/adapter-anthropic/src/adapter.ts`       | Rewrite (Commit 2) | `AnthropicAdapter` class with system extraction + content-block parsing + capability gate |
| `packages/adapter-anthropic/test/adapter.test.ts` | Rewrite (Commit 2) | 9 unit tests with mocked `global.fetch`                                                   |
| `packages/adapter-anthropic/package.json`         | Modify (Commit 2)  | Add `@jest/globals: 29.7.0` devDep                                                        |
| `packages/adapter-anthropic/CLAUDE.md`            | Modify (Commit 3)  | Update: 429→Budget, capability stance, system extraction, no SDK                          |
| `.changeset/feat-adapter-anthropic-implement.md`  | Create (Commit 4)  | `@tierfall/core` minor (linked-mode)                                                      |
| `packages/adapter-anthropic/src/index.ts`         | Unchanged          | Still exports `AnthropicAdapter` + `AnthropicAdapterConfig`                               |

---

## Constraints recap

- No `any` outside test files. No `// eslint-disable*`. No `// @ts-*`.
- All commits signed off (`git commit -s`). Never `--no-verify`.
- Stay on `feat/adapter-anthropic-implement`. Each commit passes pre-commit on its own.
- `core:test` must end green (gating). `adapter-anthropic:test` should also end green.
- Run prettier --write before committing if pre-commit complains.
- Reuse the `@jest/globals` import pattern from #5 (`import { afterEach, describe, expect, it, jest } from '@jest/globals';`).

---

## Commit 1 — Add HTTP layer (`postMessages`)

### Task 1.1: Create `packages/adapter-anthropic/src/http.ts`

**Files:**

- Create: `packages/adapter-anthropic/src/http.ts`

- [ ] **Step 1: Write the file**

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

/**
 * POST /v1/messages against Anthropic's API. Maps every failure into the
 * canonical fall errors:
 * - 429 (rate limit / quota) → BudgetExceededError
 * - All other 4xx/5xx + network + malformed-JSON + shape-violation → ProviderUnavailableError
 *
 * Times out at 30s via AbortController. Returns the raw response narrowed
 * to the fields the adapter consumes.
 */
export async function postMessages(
  baseUrl: string,
  apiKey: string,
  body: AnthropicMessagesRequest,
): Promise<AnthropicMessagesResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
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

- [ ] **Step 2: Lint + typecheck (this is dead code right now, just confirming it compiles)**

```bash
pnpm exec eslint --max-warnings=0 packages/adapter-anthropic/src/http.ts
pnpm --filter @tierfall/adapter-anthropic typecheck
```

Both: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-anthropic/src/http.ts
git commit -s -m "feat(adapter-anthropic): add HTTP layer (postMessages)

Encapsulates fetch + AbortController timeout (30s) + auth headers
(x-api-key + anthropic-version) + error mapping.

Key error convention: 429 → BudgetExceededError (rate limit / quota
is a budget signal that should fall to a cheaper tier). All other
4xx/5xx + network + malformed-JSON + shape-violation map to
ProviderUnavailableError.

Validates response shape (content array + usage with input/output
tokens present).

Not yet consumed — adapter rewrite lands in Commit 2.

Refs #8."
```

---

## Commit 2 — Implement `AnthropicAdapter.complete` + 9 unit tests

### Task 2.1: Add `@jest/globals` devDep

**Files:**

- Modify: `packages/adapter-anthropic/package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install**

```bash
pnpm --filter @tierfall/adapter-anthropic add -D @jest/globals@29.7.0
```

Expected: lockfile updated; `package.json` devDependencies includes `@jest/globals: 29.7.0`.

### Task 2.2: Rewrite `packages/adapter-anthropic/src/adapter.ts`

**Files:**

- Modify: `packages/adapter-anthropic/src/adapter.ts` (rewrite the skeleton)

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

/**
 * Premium-cloud adapter targeting Anthropic's Messages API. Translates
 * `LLMRequest` to Anthropic's `POST /v1/messages` shape and back:
 *
 * - **System messages** are extracted from `request.messages` and concatenated
 *   into the top-level `system` field (Anthropic forbids `role: 'system'` in
 *   `messages`).
 * - **Content blocks** in the response are filtered to `type: 'text'`; the
 *   `text` fields are concatenated. `tool_use` and other block types are
 *   silently ignored in v0.1.
 * - **`max_tokens`** is required by Anthropic. Defaults to 4096; override via
 *   `request.maxOutputTokens`.
 *
 * **API key required.** Anthropic authenticates via `x-api-key`. The
 * constructor throws if `config.apiKey` is missing — that's a config bug,
 * not a runtime fall.
 *
 * **v0.1 capability conservatism.** `supportsTools`, `supportsStreaming`,
 * and `supportsStructuredOutput` are set to `false` even though the
 * underlying Claude Sonnet 4.7 model supports them. The adapter doesn't
 * yet implement wire-level tool calling, streaming, or structured output;
 * those land in v0.4. A `requires.tools === true` request is rejected
 * pre-HTTP with `CapabilityMismatchError`.
 */
export class AnthropicAdapter implements Adapter {
  readonly name = 'anthropic';
  readonly tier: Tier = 'premium-cloud';
  readonly capability: AdapterCapability;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(config: AnthropicAdapterConfig) {
    if (config.apiKey === undefined || config.apiKey === '') {
      throw new Error(
        "AnthropicAdapter requires `apiKey` in config (Anthropic's Messages API authenticates via x-api-key header).",
      );
    }
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.capability = {
      contextWindowTokens: 200_000,
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

### Task 2.3: Rewrite `packages/adapter-anthropic/test/adapter.test.ts`

**Files:**

- Modify: `packages/adapter-anthropic/test/adapter.test.ts` (replace the single red TDD test with 9 unit tests)

- [ ] **Step 1: Replace the file contents**

```ts
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  ProviderUnavailableError,
} from '@tierfall/core';
import { AnthropicAdapter } from '../src/adapter.js';

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
  id: 'msg_01abc',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-7',
  content: [{ type: 'text', text: 'pong' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 5, output_tokens: 3 },
};

describe('AnthropicAdapter (closes #8)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes #8: happy path — returns text, usage, and computed cost', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new AnthropicAdapter({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-7',
    });

    const result = await adapter.complete({
      model: 'claude-sonnet-4-7',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');

    expect(result.text).toBe('pong');
    expect(result.tier).toBe('premium-cloud');
    expect(result.model).toBe('claude-sonnet-4-7');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(3);
    // 5 in * $3/MTok + 3 out * $15/MTok = 0.000015 + 0.000045 = 0.00006
    expect(result.usage.estimatedCostUSD).toBeCloseTo(0.00006, 10);
    expect(result.fallChain).toEqual([]);
  });

  it('closes #8: system messages are extracted to top-level system field', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    await adapter.complete({
      model: 'claude-sonnet-4-7',
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'system', content: 'Reply with one word.' },
        { role: 'user', content: 'ping' },
      ],
    });

    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      system?: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.system).toBe('You are concise.\n\nReply with one word.');
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(body.messages.some((m) => m.role === 'system')).toBe(false);
  });

  it('closes #8: multiple text blocks concatenated; tool_use blocks ignored', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        body: {
          ...okBody,
          content: [
            { type: 'text', text: 'Hello, ' },
            { type: 'tool_use', id: 'tu_01', name: 'lookup', input: { x: 1 } },
            { type: 'text', text: 'world!' },
          ],
        },
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const result = await adapter.complete({
      model: 'claude-sonnet-4-7',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.text).toBe('Hello, world!');
  });

  it('closes #8: HTTP 401 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 401,
        statusText: 'Unauthorized',
        text: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-bogus', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('401');
    expect((caught as Error).message).toContain('invalid x-api-key');
  });

  it('closes #8: HTTP 429 maps to BudgetExceededError (not ProviderUnavailableError)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 429,
        statusText: 'Too Many Requests',
        text: '{"type":"error","error":{"type":"rate_limit_error","message":"rate limit hit"}}',
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as Error).message).toContain('429');
    expect((caught as Error).message).toContain('rate limit');
  });

  it('closes #8: HTTP 503 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 503,
        statusText: 'Service Unavailable',
        text: 'service unavailable',
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('503');
  });

  it('closes #8: network error maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('failed');
  });

  it('closes #8: requires.tools === true → CapabilityMismatchError before any HTTP', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    await expect(
      adapter.complete({
        model: 'claude-sonnet-4-7',
        messages: [{ role: 'user', content: 'ping' }],
        requires: { tools: true },
      }),
    ).rejects.toBeInstanceOf(CapabilityMismatchError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes #8: missing apiKey → constructor throws', () => {
    expect(() => new AnthropicAdapter({ model: 'claude-sonnet-4-7' })).toThrow(/requires `apiKey`/);
    expect(() => new AnthropicAdapter({ apiKey: '', model: 'claude-sonnet-4-7' })).toThrow(
      /requires `apiKey`/,
    );
  });
});
```

### Task 2.4: Build, lint, typecheck, test

- [ ] **Step 1: Build core + adapter (so cross-package types resolve)**

```bash
pnpm exec nx run-many --target=build --projects=core,adapter-anthropic
```

Expected: exit 0.

- [ ] **Step 2: Lint + typecheck**

```bash
pnpm exec eslint --max-warnings=0 packages/adapter-anthropic
pnpm --filter @tierfall/adapter-anthropic typecheck
```

Both: exit 0.

If lint reports `no-unsafe-call` errors on `jest.spyOn` etc., `@jest/globals` was not added correctly in Task 2.1 — rerun `pnpm install` and verify the devDep is in `package.json`.

- [ ] **Step 3: Run tests — 9 should pass**

```bash
pnpm --filter @tierfall/adapter-anthropic test 2>&1 | grep -E "(PASS|FAIL|Tests:)"
```

Expected: `Tests: 9 passed, 9 total`.

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-anthropic/src/adapter.ts packages/adapter-anthropic/test/adapter.test.ts packages/adapter-anthropic/package.json pnpm-lock.yaml
git commit -s -m "feat(adapter-anthropic): implement complete() + 9 unit tests

Real implementation translates LLMRequest to Anthropic's POST /v1/messages
shape and back. Uses src/http.ts (Commit 1) for HTTP plumbing.

- System messages extracted from request.messages and concatenated
  into the top-level 'system' field (Anthropic forbids role='system'
  in messages array)
- Content blocks in response: type='text' concatenated; other blocks
  (tool_use, etc.) silently ignored in v0.1
- max_tokens required by Anthropic; defaults to 4096
- requires.tools === true → CapabilityMismatchError pre-HTTP
- 401/403/4xx (other than 429)/5xx/network/malformed-JSON/shape-violation
  → ProviderUnavailableError
- 429 → BudgetExceededError (rate limit / quota is a budget signal —
  fall to a cheaper tier, don't keep retrying premium)
- Constructor throws on missing/empty apiKey (config bug, not a runtime fall)

Default capability: 200K context, supportsTools/Streaming/StructuredOutput
all false in v0.1 (flip in v0.4 when wire-level implementation lands).
Cost defaults: \$3/MTok input, \$15/MTok output (verify against current
rate card at adoption).

Tests via @jest/globals (pnpm strict hoisting doesn't expose Jest's
globals through @types/jest). 9 unit tests cover happy path, system
extraction, content-block concatenation, four error mappings, capability
gate, missing apiKey.

Closes #8."
```

---

## Commit 3 — Update CLAUDE.md

### Task 3.1: Rewrite `packages/adapter-anthropic/CLAUDE.md`

**Files:**

- Modify: `packages/adapter-anthropic/CLAUDE.md`

- [ ] **Step 1: Replace the file contents**

```markdown
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
```

- [ ] **Step 2: Verify prettier**

```bash
pnpm exec prettier --check packages/adapter-anthropic/CLAUDE.md
```

Expected: exit 0. If it complains, `pnpm exec prettier --write` first.

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-anthropic/CLAUDE.md
git commit -s -m "docs(adapter-anthropic): CLAUDE.md gotchas + 429 mapping

Updates CLAUDE.md to match the issue #8 implementation:
- System messages extracted to top-level system field (Anthropic
  forbids role='system' in messages[])
- Content blocks: type='text' concatenated; tool_use ignored in v0.1
- max_tokens required, defaults 4096
- 429 → BudgetExceededError (deviation from scaffold CLAUDE.md which
  said ProviderUnavailable; the convention is rate limit = budget
  signal per #6 AC)
- v0.1 capability conservatism: supportsTools/Streaming/Structured
  all false until v0.4 wire-level implementation
- No @anthropic-ai/sdk; built-in fetch only
- auth headers (x-api-key + anthropic-version)
- 30s timeout via AbortController
- Tests use @jest/globals; no integration tests in v0.1

Refs #8."
```

---

## Commit 4 — Changeset

### Task 4.1: Create the changeset

**Files:**

- Create: `.changeset/feat-adapter-anthropic-implement.md`

- [ ] **Step 1: Write the changeset**

```markdown
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
```

- [ ] **Step 2: Verify changeset status**

```bash
pnpm exec changeset status 2>&1 | head -15
```

Expected: `@tierfall/core` and the three adapter packages listed at minor (linked-mode).

- [ ] **Step 3: Commit**

```bash
git add .changeset/feat-adapter-anthropic-implement.md
git commit -s -m "docs(adapter-anthropic): changeset for #8

Changeset: @tierfall/core minor (linked-mode bumps all four published
packages together at publish).

Refs #8."
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
- test: only `adapter-openai-compatible:test` still red (issues #6/#7); `core:test`, `adapter-ollama:test`, `adapter-anthropic:test` all PASS
- build: pass

If `adapter-anthropic:test` fails, **stop** and investigate — the implementation has a real bug.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/adapter-anthropic-implement
```

- [ ] **Step 4: Open PR**

````bash
gh pr create \
  --base develop \
  --head feat/adapter-anthropic-implement \
  --title "feat(adapter-anthropic): implement complete() against Messages API" \
  --body-file - <<'BODY'
## Summary

Implements `AnthropicAdapter.complete` per the design spec at
`docs/superpowers/specs/2026-05-20-adapter-anthropic-implementation-design.md`.

Closes #8. **Two adapters real, one to go** — after this PR, only the
OpenAI-compatible adapter (#6 + /presets #7) remains in the v0.1 backlog.

## Acceptance criteria

- [x] Handles Anthropic's distinct message shape (system top-level; content as blocks)
- [x] Maps Anthropic errors to `ProviderUnavailableError` / `BudgetExceededError`
- [x] Default capability matches `claude-sonnet-4-7` (200K context, current pricing)
- [x] Existing red test passes + 9 unit tests (happy path, message-shape translation, error mapping)
- [x] CLAUDE.md updated with translation gotchas vs OpenAI
- [x] Changeset added (`@tierfall/core` minor)

## Deviations from issue #8 AC

**(a) Capability flags conservatism.** AC says capability should match
Sonnet 4.7's published characteristics including "tools, streaming, structured
output". The adapter sets all three to **`false`** in v0.1 because it
doesn't yet implement wire-level tool calling, streaming, or structured output
— those land in v0.4. Setting them `true` would silently break requests that
pass through the policy filter expecting the support. Same conservative stance
as Ollama (issue #5). Documented in CLAUDE.md; will flip in v0.4 alongside
implementation.

**(b) No integration tests in v0.1.** AC says "≥3 tests" without specifying
integration. All 9 tests are unit tests with mocked `fetch`. Real Anthropic
API calls cost actual money and we don't want CI burning credits on every PR.
v0.4 can add env-gated integration tests when streaming + tools land.

**(c) 429 maps to `BudgetExceededError`.** Existing CLAUDE.md said
`ProviderUnavailableError`; this PR updates to `BudgetExceededError` per
issue #6's analogous AC convention. Rate limits and quota errors are budget
signals — the router should fall to a cheaper tier, not keep retrying premium.

## How to validate locally

```bash
pnpm install
pnpm --filter @tierfall/adapter-anthropic test    # 9 mocked unit tests, all green
pnpm run check                                    # only adapter-openai-compatible still red (#6/#7)
````

## Commits (5 total)

The exact hashes are visible in the commit list above this PR description.
BODY

```

- [ ] **Step 5: Watch CI**

Use Monitor on `gh pr checks <PR#>` until all checks complete. Expect all 13 checks green (12 from before + `test-integration-ollama` which still runs but is unrelated).

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
test-integration-ollama: pass
test-rest: pass (only adapter-openai-compatible still red TDD — masked by continue-on-error)
typecheck: pass

````

- [ ] **Step 6: Merge**

```bash
gh pr merge <PR#> --merge --delete-branch --admin
````

- [ ] **Step 7: Move board card to Done; pull develop**

```bash
source "$CLAUDE_JOB_DIR/project-ids.sh"
ITEM_ID=$(gh api graphql -f query='{ organization(login: "tierfall") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }' --jq '.data.organization.projectV2.items.nodes[] | select(.content.number==8) | .id')
gh project item-edit --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_DONE_ID" --project-id "$PROJECT_ID" > /dev/null

git checkout develop
git pull --ff-only origin develop
git log --oneline -5
```
