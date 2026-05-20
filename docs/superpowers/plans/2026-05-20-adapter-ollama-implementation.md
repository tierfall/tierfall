# Ollama Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `OllamaAdapter.complete` against `POST /api/chat`. Split HTTP plumbing into `src/http.ts`. Ship 8 unit tests (mocked fetch) + 3 integration tests (gated on env). Add a CI job that runs the integration tests against a service-container Ollama with `qwen2.5:0.5b`.

**Architecture:** `src/http.ts` exports `postChat(baseUrl, body)` — encapsulates fetch, AbortController timeout, error mapping, response shape validation. `src/adapter.ts` translates `LLMRequest` ↔ Ollama wire format and applies the `requires.tools` capability gate. Unit tests `jest.spyOn` on `global.fetch`; integration tests hit a real daemon via `TIERFALL_OLLAMA_TEST_URL`.

**Tech Stack:** TypeScript 6.0.3, Node 24's built-in fetch, Jest 29.7.0 + ts-jest 29.4.10, AbortController, ollama/ollama:0.24.0 service container.

**Spec:** `docs/superpowers/specs/2026-05-20-adapter-ollama-implementation-design.md`
**Tracked issue:** [#5](https://github.com/tierfall/tierfall/issues/5)
**Branch:** `feat/adapter-ollama-implement`

---

## File map

| File                                                       | Operation          | Responsibility                                                                                                 |
| ---------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `packages/adapter-ollama/src/http.ts`                      | Create (Commit 1)  | `postChat` + `OllamaChatRequest` / `OllamaChatResponse` types + error mapping                                  |
| `packages/adapter-ollama/src/adapter.ts`                   | Rewrite (Commit 2) | `OllamaAdapter` class with `complete` implementation + `requires.tools` gate                                   |
| `packages/adapter-ollama/test/adapter.test.ts`             | Rewrite (Commit 2) | 8 unit tests with mocked `global.fetch`                                                                        |
| `packages/adapter-ollama/test/adapter.integration.test.ts` | Create (Commit 3)  | 3 integration tests, gated on `TIERFALL_OLLAMA_TEST_URL`                                                       |
| `packages/adapter-ollama/package.json`                     | Modify (Commit 3)  | Add `test:integration` script; update `test` to exclude integration file                                       |
| `packages/adapter-ollama/jest.config.js`                   | Modify (Commit 3)  | `testPathIgnorePatterns` for `*.integration.test.ts` in the default run                                        |
| `packages/adapter-ollama/project.json`                     | Modify (Commit 3)  | Add `test:integration` Nx target                                                                               |
| `.github/workflows/ci.yml`                                 | Modify (Commit 3)  | Add `test-integration-ollama` job with service container + tiny-model pull                                     |
| `packages/adapter-ollama/CLAUDE.md`                        | Modify (Commit 4)  | Document gotchas: cached prompt → undefined eval_count, trailing-slash normalization, model-not-found behavior |
| `.changeset/feat-adapter-ollama-implement.md`              | Create (Commit 4)  | `@tierfall/core` minor bump (linked-mode bumps all four published packages)                                    |
| `packages/adapter-ollama/src/index.ts`                     | Unchanged          | Still exports `OllamaAdapter` + `OllamaAdapterConfig`                                                          |

---

## Constraints recap

- No `any` outside test files. No `// eslint-disable*`. No `// @ts-*`.
- All commits signed off (`git commit -s`). Never `--no-verify`.
- Stay on `feat/adapter-ollama-implement`. Each commit passes pre-commit on its own.
- `core:test` must end green (gating). `adapter-ollama:test` (unit-only after this PR) should also end green.
- The new `test-integration-ollama` CI job starts with `continue-on-error: true` — not a blocker for merge.

---

## Commit 1 — Add HTTP layer (`postChat`)

### Task 1.1: Create `packages/adapter-ollama/src/http.ts`

**Files:**

- Create: `packages/adapter-ollama/src/http.ts`

- [ ] **Step 1: Write the file**

```ts
import { ProviderUnavailableError } from '@tierfall/core';

export interface OllamaChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface OllamaChatRequest {
  readonly model: string;
  readonly messages: readonly OllamaChatMessage[];
  readonly stream: false;
}

export interface OllamaChatResponse {
  readonly message: { readonly role: string; readonly content: string };
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
  readonly done_reason?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * POST /api/chat against the Ollama daemon at `baseUrl`. Maps every failure
 * into `ProviderUnavailableError` with a useful detail string. Times out at 30s.
 *
 * Returns the raw Ollama response narrowed to the fields the adapter consumes.
 * Trailing `/` on `baseUrl` is normalized away to avoid double slashes.
 */
export async function postChat(
  baseUrl: string,
  body: OllamaChatRequest,
): Promise<OllamaChatResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ProviderUnavailableError(
      `Ollama request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable body>');
    throw new ProviderUnavailableError(
      `Ollama ${String(response.status)} ${response.statusText}: ${text}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new ProviderUnavailableError(
      `Ollama returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!isValidChatResponse(data)) {
    throw new ProviderUnavailableError(`Ollama returned unexpected shape: ${JSON.stringify(data)}`);
  }
  return data;
}

function isValidChatResponse(value: unknown): value is OllamaChatResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  const message = obj.message;
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  return typeof msg.content === 'string';
}
```

- [ ] **Step 2: Verify lint + typecheck (this is dead code right now, just confirming it compiles)**

```bash
pnpm --filter @tierfall/adapter-ollama typecheck
pnpm exec eslint --max-warnings=0 packages/adapter-ollama/src/http.ts
```

Both: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-ollama/src/http.ts
git commit -s -m "feat(adapter-ollama): add HTTP layer (postChat)

Encapsulates fetch + AbortController timeout (30s) + error mapping
into ProviderUnavailableError. Validates Ollama's response shape
(message.content present, JSON parses cleanly).

Not yet consumed — adapter rewrite lands in Commit 2.

Refs #5."
```

---

## Commit 2 — Implement `OllamaAdapter.complete` + 8 unit tests

### Task 2.1: Rewrite `packages/adapter-ollama/src/adapter.ts`

**Files:**

- Modify: `packages/adapter-ollama/src/adapter.ts` (rewrite the skeleton)

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
import { postChat } from './http.js';

export interface OllamaAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * On-device adapter targeting an Ollama daemon. Translates `LLMRequest` to
 * Ollama's `POST /api/chat` shape and back. Free (cost is null); availability
 * depends on the daemon.
 *
 * Default `baseUrl` is `http://localhost:11434`. `apiKey` is accepted in the
 * config for parity with cloud adapters but is ignored — Ollama doesn't
 * authenticate.
 *
 * Tool calling is **not** supported in v0.1; a request with
 * `requires.tools === true` rejects with `CapabilityMismatchError` before any
 * HTTP traffic. Streaming and structured output also unsupported in v0.1.
 */
export class OllamaAdapter implements Adapter {
  readonly name = 'ollama';
  readonly tier: Tier = 'on-device';
  readonly capability: AdapterCapability;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaAdapterConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.model = config.model;
    this.capability = {
      contextWindowTokens: 8192,
      supportsTools: false,
      supportsStreaming: true,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: null,
      costPerMillionOutputTokens: null,
      ...config.capability,
    };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (request.requires?.tools === true) {
      throw new CapabilityMismatchError(
        'Ollama does not support tool calling yet — landing in v0.4',
      );
    }

    const data = await postChat(this.baseUrl, {
      model: this.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    });

    return {
      text: data.message.content,
      tier: this.tier,
      model: this.model,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        estimatedCostUSD: 0,
      },
      fallChain: [],
    };
  }
}
```

### Task 2.2: Rewrite `packages/adapter-ollama/test/adapter.test.ts`

**Files:**

- Modify: `packages/adapter-ollama/test/adapter.test.ts` (replace the single red TDD test with 8 unit tests)

- [ ] **Step 1: Replace the file contents**

```ts
import { CapabilityMismatchError, ProviderUnavailableError } from '@tierfall/core';
import { OllamaAdapter } from '../src/adapter.js';

function mockFetchResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  text?: string;
}): Response {
  const ok = opts.ok ?? true;
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
  message: { role: 'assistant', content: 'pong' },
  prompt_eval_count: 5,
  eval_count: 3,
  done_reason: 'stop',
};

describe('OllamaAdapter (closes #5)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes #5: happy path — returns text and usage', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b', baseUrl: 'http://localhost:11434' });

    const result = await adapter.complete({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('http://localhost:11434/api/chat');
    expect(result.text).toBe('pong');
    expect(result.tier).toBe('on-device');
    expect(result.model).toBe('llama3.2:3b');
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 3, estimatedCostUSD: 0 });
    expect(result.fallChain).toEqual([]);
  });

  it('closes #5: requires.tools === true → CapabilityMismatchError before any HTTP', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    await expect(
      adapter.complete({
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: 'ping' }],
        requires: { tools: true },
      }),
    ).rejects.toBeInstanceOf(CapabilityMismatchError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes #5: HTTP 404 maps to ProviderUnavailableError with body detail', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: 'model "missing-model" not found',
      }),
    );
    const adapter = new OllamaAdapter({ model: 'missing-model' });

    const caught = await adapter
      .complete({ model: 'missing-model', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('404');
    expect((caught as Error).message).toContain('Not Found');
    expect((caught as Error).message).toContain('missing-model');
  });

  it('closes #5: HTTP 503 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: 'overloaded',
      }),
    );
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    const caught = await adapter
      .complete({ model: 'llama3.2:3b', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('503');
  });

  it('closes #5: network error maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    const caught = await adapter
      .complete({ model: 'llama3.2:3b', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('failed');
  });

  it('closes #5: unexpected response shape maps to ProviderUnavailableError', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(mockFetchResponse({ body: { unrelated: 'shape' } }));
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    const caught = await adapter
      .complete({ model: 'llama3.2:3b', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('unexpected shape');
  });

  it('closes #5: missing prompt_eval_count coalesces to 0', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        body: { message: { role: 'assistant', content: 'cached' } },
      }),
    );
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });
    const result = await adapter.complete({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(Number.isNaN(result.usage.inputTokens)).toBe(false);
  });

  it('closes #5: baseUrl trailing slash is normalized', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OllamaAdapter({
      model: 'llama3.2:3b',
      baseUrl: 'http://localhost:11434/',
    });
    await adapter.complete({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(spy.mock.calls[0]?.[0]).toBe('http://localhost:11434/api/chat');
  });
});
```

- [ ] **Step 2: Build (so `@tierfall/core` types are available)**

Run: `pnpm exec nx run-many --target=build --projects=core,adapter-ollama`
Expected: exit 0.

- [ ] **Step 3: Lint + typecheck**

```bash
pnpm exec eslint --max-warnings=0 packages/adapter-ollama
pnpm --filter @tierfall/adapter-ollama typecheck
```

Both: exit 0.

- [ ] **Step 4: Run tests — 8 should pass**

Run: `pnpm --filter @tierfall/adapter-ollama test 2>&1 | grep -E "(PASS|FAIL|Tests:)"`
Expected: `Tests: 8 passed, 8 total`.

If any test fails, **stop** and inspect — the test setup probably has a real bug (response shape, fetch mock signature) rather than a flaw in the implementation.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-ollama/src/adapter.ts packages/adapter-ollama/test/adapter.test.ts
git commit -s -m "feat(adapter-ollama): implement complete() + 8 unit tests

Real implementation translates LLMRequest to Ollama's POST /api/chat
shape and back. Uses src/http.ts (Commit 1) for HTTP plumbing.

- requires.tools === true → CapabilityMismatchError before any HTTP
- Network / 4xx / 5xx / malformed-JSON / shape-violation all map to
  ProviderUnavailableError via postChat
- prompt_eval_count / eval_count coalesce to 0 when Ollama elides them
  (cached prompts)
- baseUrl trailing slash normalized to avoid double-slash in URL

Tests use jest.spyOn(global, 'fetch') — restored after each test via
afterEach jest.restoreAllMocks().

Closes #5 (test:integration in Commit 3)."
```

---

## Commit 3 — Integration tests + CI job

### Task 3.1: Create `packages/adapter-ollama/test/adapter.integration.test.ts`

**Files:**

- Create: `packages/adapter-ollama/test/adapter.integration.test.ts`

- [ ] **Step 1: Write the file**

```ts
import { ProviderUnavailableError } from '@tierfall/core';
import { OllamaAdapter } from '../src/adapter.js';

const OLLAMA_URL = process.env.TIERFALL_OLLAMA_TEST_URL;
const OLLAMA_MODEL = process.env.TIERFALL_OLLAMA_TEST_MODEL ?? 'qwen2.5:0.5b';
const describeIntegration = OLLAMA_URL ? describe : describe.skip;

describeIntegration('OllamaAdapter integration (closes #5)', () => {
  it('completes a basic request against a real Ollama', async () => {
    const adapter = new OllamaAdapter({
      baseUrl: OLLAMA_URL,
      model: OLLAMA_MODEL,
    });

    const result = await adapter.complete({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
    });

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.tier).toBe('on-device');
    expect(result.model).toBe(OLLAMA_MODEL);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.estimatedCostUSD).toBe(0);
  }, 60_000);

  it('model-not-found returns ProviderUnavailableError', async () => {
    const adapter = new OllamaAdapter({
      baseUrl: OLLAMA_URL,
      model: 'definitely-not-a-real-model:0b',
    });

    const caught = await adapter
      .complete({
        model: 'definitely-not-a-real-model:0b',
        messages: [{ role: 'user', content: 'ping' }],
      })
      .catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
  }, 30_000);

  it('connection refused (closed port) returns ProviderUnavailableError', async () => {
    const adapter = new OllamaAdapter({
      baseUrl: 'http://127.0.0.1:1',
      model: OLLAMA_MODEL,
    });

    const caught = await adapter
      .complete({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
      })
      .catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
  }, 15_000);
});
```

### Task 3.2: Update `packages/adapter-ollama/package.json`

**Files:**

- Modify: `packages/adapter-ollama/package.json`

- [ ] **Step 1: Edit scripts**

Find the `"scripts"` object. Replace the `test` script and add `test:integration`. The full scripts block after the edit:

```json
"scripts": {
  "build": "tsup",
  "test": "node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --testPathIgnorePatterns=integration",
  "test:integration": "node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --testPathPattern=integration",
  "lint": "eslint --max-warnings=0 --quiet src test",
  "typecheck": "tsc --noEmit --pretty false"
}
```

The `test` script now excludes any file with `integration` in the path; `test:integration` runs only those. Both use the same `--experimental-vm-modules` ts-jest ESM dance the other adapters use.

### Task 3.3: Update `packages/adapter-ollama/project.json`

**Files:**

- Modify: `packages/adapter-ollama/project.json`

- [ ] **Step 1: Add the `test:integration` target**

Find the `"targets"` object and add a sibling to `test`:

```json
"test:integration": {
  "executor": "nx:run-script",
  "options": { "script": "test:integration" }
}
```

Full targets block after the edit:

```json
"targets": {
  "build": { "executor": "nx:run-script", "options": { "script": "build" } },
  "test": { "executor": "nx:run-script", "options": { "script": "test" } },
  "test:integration": { "executor": "nx:run-script", "options": { "script": "test:integration" } },
  "lint": { "executor": "nx:run-script", "options": { "script": "lint" } },
  "typecheck": { "executor": "nx:run-script", "options": { "script": "typecheck" } }
}
```

### Task 3.4: Add CI job `test-integration-ollama` to `.github/workflows/ci.yml`

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append the new job after the `knip:` job at the end of the `jobs:` section**

```yaml
test-integration-ollama:
  runs-on: ubuntu-latest
  services:
    ollama:
      image: ollama/ollama:0.24.0
      ports:
        - '11434:11434'
      options: >-
        --health-cmd "ollama list"
        --health-interval 5s
        --health-timeout 3s
        --health-retries 20
  steps:
    - uses: actions/checkout@v4
      with: { fetch-depth: 0 }
    - uses: pnpm/action-setup@v4
      with: { version: '${{ env.PNPM_VERSION }}' }
    - uses: actions/setup-node@v4
      with:
        node-version: '${{ env.NODE_VERSION }}'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - run: pnpm exec nx run-many --target=build --projects=core,adapter-ollama
    - name: Pull tiny model
      run: |
        CONTAINER=$(docker ps --filter "ancestor=ollama/ollama:0.24.0" --format '{{.ID}}' | head -1)
        if [ -z "$CONTAINER" ]; then echo "Ollama container not found"; exit 1; fi
        docker exec "$CONTAINER" ollama pull qwen2.5:0.5b
    - name: Run integration tests
      env:
        TIERFALL_OLLAMA_TEST_URL: http://localhost:11434
        TIERFALL_OLLAMA_TEST_MODEL: qwen2.5:0.5b
      run: pnpm --filter @tierfall/adapter-ollama test:integration
      # TODO(#16): flip continue-on-error to false once Ollama service-container stability is proven.
      continue-on-error: true
```

- [ ] **Step 2: Verify the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`.

- [ ] **Step 3: Verify Prettier**

Run: `pnpm exec prettier --check .github/workflows/ci.yml`
Expected: exit 0. If it complains, `pnpm exec prettier --write` first.

### Task 3.5: Verify unit-test run still works after the script split

- [ ] **Step 1: Run unit tests (should NOT pick up integration file)**

```bash
pnpm --filter @tierfall/adapter-ollama test 2>&1 | grep -E "(PASS|FAIL|Tests:)" | head
```

Expected: `Tests: 8 passed, 8 total` — `adapter.integration.test.ts` is skipped because of the `--testPathIgnorePatterns=integration` flag.

- [ ] **Step 2: Run integration tests locally without env (should all skip)**

```bash
pnpm --filter @tierfall/adapter-ollama test:integration 2>&1 | grep -E "(PASS|FAIL|Tests:|skip)" | head
```

Expected: tests are skipped via `describe.skip` because `TIERFALL_OLLAMA_TEST_URL` is unset.

- [ ] **Step 3: Run workspace-wide lint + typecheck**

```bash
pnpm exec eslint --max-warnings=0 .
pnpm exec nx run-many --target=typecheck --parallel=3
```

Both: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-ollama/test/adapter.integration.test.ts \
        packages/adapter-ollama/package.json \
        packages/adapter-ollama/project.json \
        .github/workflows/ci.yml
git commit -s -m "test(adapter-ollama): integration tests + CI job

Three integration tests in adapter.integration.test.ts gated on
TIERFALL_OLLAMA_TEST_URL env. Default unit run excludes the
integration file via --testPathIgnorePatterns=integration; new
test:integration script runs only the integration file.

CI: new test-integration-ollama job with ollama/ollama:0.24.0
service container. Pulls qwen2.5:0.5b (~400MB, much smaller than
the demo's llama3.2:3b ~2GB) and runs the integration tests.
continue-on-error: true initially; TODO(#16) flips it required
once service-container stability proven.

Closes #5 (test side; impl in Commit 2)."
```

---

## Commit 4 — CLAUDE.md update + changeset

### Task 4.1: Update `packages/adapter-ollama/CLAUDE.md`

**Files:**

- Modify: `packages/adapter-ollama/CLAUDE.md`

- [ ] **Step 1: Replace the file contents**

```markdown
# packages/adapter-ollama — Claude context

`@tierfall/adapter-ollama` is the **on-device** adapter targeting a local Ollama daemon.
It implements the `Adapter` interface from `@tierfall/core` and is the canonical zero-cost
tier for the fall-never-climb router.

## Key contracts

- `OllamaAdapter` implements `Adapter` from `@tierfall/core`.
- `tier = 'on-device'`. Free (cost is `null`); availability depends on the daemon.
- Default `baseUrl` is `http://localhost:11434` (Ollama's stock config).
- `config.apiKey` is accepted for cloud-adapter parity but **ignored** — Ollama doesn't
  authenticate.

## Implementation gotchas

- **`prompt_eval_count` / `eval_count` may be `undefined`** on cached prompts. The adapter
  coalesces to `0` to keep `usage.inputTokens` / `usage.outputTokens` a plain `number`.
- **`baseUrl` trailing slash is normalized** before composing `/api/chat`. Tests verify
  both `http://host:11434` and `http://host:11434/` produce the same URL.
- **Model not found returns HTTP 404**, which maps to `ProviderUnavailableError`. The
  router falls cleanly on this — the adapter doesn't try to be clever.
- **Tool calling** (`requires.tools === true`) is **rejected before any HTTP request** via
  `CapabilityMismatchError`. Ollama does support tool calling for some models, but TierFall
  integration lands in v0.4.
- **Streaming** is not yet implemented; the wire request uses `stream: false`. Streaming
  is on the v0.4 roadmap.
- **Timeout** is fixed at 30 seconds via `AbortController`. No per-request override in
  v0.1.

## Testing

Two suites in `test/`:

- **`adapter.test.ts`** — fast unit tests with `jest.spyOn(global, 'fetch')`. Runs in
  the gated `test-rest` CI job (and locally via `pnpm --filter @tierfall/adapter-ollama test`).
- **`adapter.integration.test.ts`** — real-Ollama tests, gated on `TIERFALL_OLLAMA_TEST_URL`.
  Skipped locally without env. Run in CI by `test-integration-ollama` against a
  service-container Ollama with `qwen2.5:0.5b`.

The unit run uses `--testPathIgnorePatterns=integration`; the integration run uses
`--testPathPattern=integration`. Don't share state between the two — each test file
manages its own setup/teardown.

## When changing this package

Run both suites locally if you have an Ollama daemon:

\`\`\`bash
TIERFALL_OLLAMA_TEST_URL=http://localhost:11434 pnpm --filter @tierfall/adapter-ollama test:integration
pnpm --filter @tierfall/adapter-ollama test
\`\`\`

If you change the wire-shape mapping in `src/adapter.ts` (e.g., adding a new field to
`LLMResponse.usage`), update `src/http.ts`'s `OllamaChatResponse` type and add a
matching unit test asserting the new field's mapping.
```

### Task 4.2: Create the changeset

**Files:**

- Create: `.changeset/feat-adapter-ollama-implement.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
'@tierfall/core': minor
---

Implement `OllamaAdapter.complete` against `POST /api/chat`. The on-device tier is now
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

Closes #5.
```

- [ ] **Step 2: Verify changeset status**

Run: `pnpm exec changeset status 2>&1 | head -10`
Expected: `@tierfall/core` listed at `minor` (linked-mode bumps all four published packages).

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-ollama/CLAUDE.md .changeset/feat-adapter-ollama-implement.md
git commit -s -m "docs(adapter-ollama): CLAUDE.md gotchas + changeset

CLAUDE.md documents:
- prompt_eval_count/eval_count undefined on cached prompts (coalesced to 0)
- baseUrl trailing-slash normalization
- model-not-found → 404 → ProviderUnavailableError
- requires.tools rejected pre-HTTP (CapabilityMismatchError)
- 30s timeout via AbortController
- Two test suites (unit + integration) with split test scripts

Changeset: @tierfall/core minor (linked-mode bumps adapter packages
together at publish).

Refs #5."
```

---

## Final verification before opening the PR

- [ ] **Step 1: Branch state**

```bash
git log --oneline develop..HEAD
```

Expected: 5 commits (spec + 4 implementation commits).

- [ ] **Step 2: Full local check**

```bash
pnpm run check
```

Expected:

- lint: pass
- typecheck: pass
- test: `adapter-anthropic:test` and `adapter-openai-compatible:test` still red (issues #6/#7/#8); `core:test` and `adapter-ollama:test` PASS
- build: pass

- [ ] **Step 3: Local Ollama smoke (optional but recommended if you have one running)**

```bash
TIERFALL_OLLAMA_TEST_URL=http://localhost:11434 pnpm --filter @tierfall/adapter-ollama test:integration
```

Expected: 3 tests pass against your local Ollama (assuming `qwen2.5:0.5b` or `llama3.2:3b` is pulled — adjust `TIERFALL_OLLAMA_TEST_MODEL` env if needed).

If the local Ollama daemon isn't running, skip this step — CI will run integration tests against the service container.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/adapter-ollama-implement
```

- [ ] **Step 5: Open PR**

````bash
gh pr create \
  --base develop \
  --head feat/adapter-ollama-implement \
  --title "feat(adapter-ollama): implement complete() against Ollama /api/chat" \
  --body-file - <<'BODY'
## Summary

Implements `OllamaAdapter.complete` per the design spec at
`docs/superpowers/specs/2026-05-20-adapter-ollama-implementation-design.md`.

Closes #5. **First adapter implementation** — the on-device tier is now real.

## Acceptance criteria

- [x] Basic non-streaming completion succeeds against a live Ollama
- [x] Maps Ollama errors to `ProviderUnavailableError` (network / 4xx / 5xx)
- [x] `requires.tools === true` throws `CapabilityMismatchError`
- [x] Default capability matches `llama3.2:3b` (8192 tokens, no tools, no structured, free)
- [x] Existing red test replaced + 8 unit tests + 3 integration tests
- [x] CLAUDE.md updated with gotchas
- [x] Changeset added (`@tierfall/core` minor)

## Deviations from issue #5 AC (declared upfront)

**(a) Test split.** Existing single red TDD test replaced with 8 mocked unit tests
in `adapter.test.ts`. Three real-Ollama tests live in a new `adapter.integration.test.ts`
gated on `TIERFALL_OLLAMA_TEST_URL` env. Per kickoff #6: "if a layer can be unit-tested
cleanly with mocks, prefer that."

**(b) CI uses fresh service container, not the demo's Compose stack.** A new
`test-integration-ollama` CI job spins up `ollama/ollama:0.24.0` as a GitHub Actions
service container and pulls `qwen2.5:0.5b` (~400MB) instead of the demo's
`llama3.2:3b` (~2GB). Same coverage, ~5× faster CI. `continue-on-error: true`
initially while service-container stability is observed; flips to required check
post-stability (tracked in #16).

## How to validate locally

```bash
pnpm install
pnpm --filter @tierfall/adapter-ollama test    # 8 mocked unit tests, all green
# With local Ollama running:
TIERFALL_OLLAMA_TEST_URL=http://localhost:11434 pnpm --filter @tierfall/adapter-ollama test:integration
````

## Commits (5 total)

```
<filled in at push time>
```

BODY

```

- [ ] **Step 6: Watch CI**

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
test-integration-ollama: pass ← NEW (or fail with continue-on-error)
test-rest: pass
typecheck: pass

````

If `test-integration-ollama` fails, **review the failure**:
- Service-container startup race? Add a retry to the health check.
- Model pull failure? Check the docker exec command (container name detection).
- Real test failure? Then the implementation has a regression — stop and investigate.

Since the job is `continue-on-error: true`, failure does NOT block merge.

- [ ] **Step 7: Merge**

```bash
gh pr merge <PR#> --merge --delete-branch --admin
````

- [ ] **Step 8: Move board card to Done; pull develop**

```bash
source "$CLAUDE_JOB_DIR/project-ids.sh"
ITEM_ID=$(gh api graphql -f query='{ organization(login: "tierfall") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }' --jq '.data.organization.projectV2.items.nodes[] | select(.content.number==5) | .id')
gh project item-edit --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_DONE_ID" --project-id "$PROJECT_ID" > /dev/null

git checkout develop
git pull --ff-only origin develop
git log --oneline -5
```
