# Ollama Adapter Implementation — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#5 — feat(adapter-ollama): implement complete() against Ollama /api/chat](https://github.com/tierfall/tierfall/issues/5)
**Scope:** Replace `OllamaAdapter.complete` skeleton with a real implementation against `POST /api/chat` on a local Ollama daemon. Split into `adapter.ts` + new `http.ts`. Ship unit tests (mocked fetch) + integration tests (gated on env, run by a new CI job).

---

## 1. Goal

Make the on-device tier work. After this PR, a request flowing through a `Router([OllamaAdapter])` produces real LLM output (or a clean `ProviderUnavailableError` if the daemon is offline).

## 2. Inputs

The existing constructor signature stays:

```ts
interface OllamaAdapterConfig {
  readonly baseUrl?: string; // default 'http://localhost:11434'
  readonly apiKey?: string; // accepted for cloud-adapter parity; ignored
  readonly model: string; // required, e.g. 'llama3.2:3b'
  readonly capability?: Partial<AdapterCapability>;
}
```

Per-instance: one adapter targets one model. Use multiple adapters for multiple models.

## 3. HTTP layer (`packages/adapter-ollama/src/http.ts` — new file)

Pull HTTP plumbing into its own module. The adapter calls into it; tests can mock either layer.

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
 * into ProviderUnavailableError with a useful detail string. Times out at 30s.
 *
 * The returned shape is the raw Ollama response narrowed to the fields we use.
 */
export async function postChat(
  baseUrl: string,
  body: OllamaChatRequest,
): Promise<OllamaChatResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

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
    throw new ProviderUnavailableError(`Ollama ${response.status} ${response.statusText}: ${text}`);
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

## 4. Adapter (`packages/adapter-ollama/src/adapter.ts` — rewrite)

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
  /* (unchanged) */
}

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
        'Ollama does not support tool calling yet — landing in v0.4 (issue tracked separately)',
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

## 5. Tests

### 5.1 Unit tests (`packages/adapter-ollama/test/adapter.test.ts` — rewrite)

Mock `global.fetch` with `jest.spyOn`. Replaces the existing red TDD test.

| #   | Name                                                                 | Setup                                      | Assertion                                                                                                           |
| --- | -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1   | **happy path**                                                       | `fetch` returns 200 with valid Ollama JSON | `text`, `usage.inputTokens`, `usage.outputTokens` populated; `tier === 'on-device'`; `usage.estimatedCostUSD === 0` |
| 2   | **`requires.tools: true` → CapabilityMismatchError before any HTTP** | request has `requires.tools: true`         | rejects with `CapabilityMismatchError`; `fetch` not called                                                          |
| 3   | **4xx maps to ProviderUnavailableError**                             | `fetch` returns 404 with body              | rejects with `ProviderUnavailableError` whose message includes `404` and the body                                   |
| 4   | **5xx maps to ProviderUnavailableError**                             | `fetch` returns 503                        | rejects with `ProviderUnavailableError` including `503`                                                             |
| 5   | **Network error maps to ProviderUnavailableError**                   | `fetch` throws `TypeError('fetch failed')` | rejects with `ProviderUnavailableError` including `failed`                                                          |
| 6   | **Unexpected response shape maps to ProviderUnavailableError**       | `fetch` returns 200 with `{ foo: 'bar' }`  | rejects with `ProviderUnavailableError` including `unexpected shape`                                                |
| 7   | **`prompt_eval_count` undefined coalesces to 0**                     | response missing the field                 | `usage.inputTokens === 0` (not NaN)                                                                                 |
| 8   | **`baseUrl` trailing slash normalized**                              | `baseUrl: 'http://localhost:11434/'`       | fetch called with `.../api/chat`, not `...//api/chat`                                                               |

After commit, `pnpm --filter @tierfall/adapter-ollama test` passes (unit-only, no real Ollama).

### 5.2 Integration tests (`packages/adapter-ollama/test/adapter.integration.test.ts` — new file)

Gated on `TIERFALL_OLLAMA_TEST_URL` env. Without it, every test `it.skip`s. With it, run real `postChat` against a live Ollama. Use a tiny model (`qwen2.5:0.5b`).

| #   | Name                                                 | Assertion                                                                                                                                        |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **completes a basic request end-to-end**             | response text is a non-empty string; usage tokens > 0                                                                                            |
| 2   | **model-not-found returns ProviderUnavailableError** | adapter configured with `'nonexistent-model:0b'`; complete() rejects with `ProviderUnavailableError` whose message mentions `404` or `not found` |
| 3   | **abort/timeout maps to ProviderUnavailableError**   | point at `http://127.0.0.1:1` (closed port), expect `ProviderUnavailableError` quickly (fetch's connection refusal)                              |

File layout:

```ts
const OLLAMA_URL = process.env.TIERFALL_OLLAMA_TEST_URL;
const describeIntegration = OLLAMA_URL ? describe : describe.skip;

describeIntegration('OllamaAdapter integration (closes #5)', () => {
  // ...
});
```

### 5.3 Nx test target split

`packages/adapter-ollama/package.json`:

- `test` script — runs only `adapter.test.ts` (unit). This keeps `pnpm --filter @tierfall/adapter-ollama test` in CI fast and deterministic.
- New `test:integration` script — runs only `adapter.integration.test.ts`. Used by the new CI job.

In Nx target defaults at the package level: add a `test:integration` target.

Jest pattern: testMatch separates the two via filename.

## 6. CI changes (`.github/workflows/ci.yml`)

Add a new job:

```yaml
test-integration-ollama:
  runs-on: ubuntu-latest
  services:
    ollama:
      image: ollama/ollama:0.24.0
      ports: ['11434:11434']
      options: --health-cmd "ollama list" --health-interval 5s --health-timeout 3s --health-retries 20
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: '${{ env.PNPM_VERSION }}' }
    - uses: actions/setup-node@v4
      with:
        node-version: '${{ env.NODE_VERSION }}'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - run: pnpm exec nx run-many --target=build --projects=core,adapter-ollama
    - name: Pull tiny model
      run: docker exec $(docker ps --filter "ancestor=ollama/ollama:0.24.0" --format '{{.ID}}') ollama pull qwen2.5:0.5b
    - name: Run integration tests
      env:
        TIERFALL_OLLAMA_TEST_URL: http://localhost:11434
        TIERFALL_OLLAMA_TEST_MODEL: qwen2.5:0.5b
      run: pnpm --filter @tierfall/adapter-ollama test:integration
      continue-on-error: true # TODO(#16): flip to required once Ollama service stability is proven
```

**Initially `continue-on-error: true`** because GitHub Actions service containers + model pulls are flaky at scale. After 2-3 PRs prove it stable, flip to required (track in issue #16).

**Don't add to branch protection required checks yet** for the same reason.

## 7. Files changed

| File                                                       | Operation                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/adapter-ollama/src/http.ts`                      | Create                                                                                |
| `packages/adapter-ollama/src/adapter.ts`                   | Rewrite (replaces skeleton)                                                           |
| `packages/adapter-ollama/src/index.ts`                     | Unchanged                                                                             |
| `packages/adapter-ollama/test/adapter.test.ts`             | Rewrite (8 unit tests, mocked fetch)                                                  |
| `packages/adapter-ollama/test/adapter.integration.test.ts` | Create (3 gated integration tests)                                                    |
| `packages/adapter-ollama/package.json`                     | Add `test:integration` script; update `test` to exclude `*.integration.test.ts`       |
| `packages/adapter-ollama/jest.config.js`                   | If needed: project for integration tests; or `testPathIgnorePatterns` on the unit run |
| `packages/adapter-ollama/CLAUDE.md`                        | Update with implementation gotchas                                                    |
| `.github/workflows/ci.yml`                                 | Add `test-integration-ollama` job                                                     |
| `.changeset/feat-adapter-ollama-implement.md`              | `@tierfall/core` minor (linked-mode)                                                  |

## 8. Commit plan

**4 commits** on `feat/adapter-ollama-implement`:

1. **`feat(adapter-ollama): add HTTP layer (postChat)`** — `src/http.ts` + types. Pre-impl scaffold; not directly testable yet.
2. **`feat(adapter-ollama): implement complete() + 8 unit tests`** — `src/adapter.ts` + `test/adapter.test.ts`. Existing red test refactored away; new unit suite green.
3. **`test(adapter-ollama): add integration tests + CI job`** — `test/adapter.integration.test.ts`, `package.json` script split, `jest.config.js` adjustment if needed, `ci.yml` new job. Documented as `continue-on-error: true` initially.
4. **`docs(adapter-ollama): CLAUDE.md + changeset`** — implementation gotchas + `.changeset` file.

## 9. Acceptance criteria mapping

| AC from issue #5                                                                                             | How met                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic non-streaming completion succeeds against a live Ollama                                                | Integration test #1; unit test #1 with mocked happy-path response                                                                                                                                                                                        |
| Maps Ollama errors to `ProviderUnavailableError` (network / 4xx / 5xx)                                       | Unit tests #3/#4/#5; §4 catch-all in `postChat`                                                                                                                                                                                                          |
| If `request.requires.tools === true`, throws `CapabilityMismatchError`                                       | Unit test #2; §4 adapter early-return                                                                                                                                                                                                                    |
| Default `capability` reflects `llama3.2:3b` (8192 tokens, no tools, no structured, free)                     | Already correct in skeleton; preserved in §4                                                                                                                                                                                                             |
| Existing red test passes + ≥3 integration tests against a real Ollama (run in CI via demo's Compose service) | **Deviation:** existing test replaced with 8 mocked unit tests; 3 integration tests added in a new file; CI runs them via a dedicated job using a service container + `qwen2.5:0.5b` (smaller than the demo's `llama3.2:3b`, more CI-friendly). See §11. |
| CLAUDE.md updated with known gotchas                                                                         | Commit 4 — note `prompt_eval_count` undefined-on-cache, base-URL trailing-slash normalization, model-not-found returns 404, abort/timeout behavior                                                                                                       |
| Changeset added                                                                                              | Commit 4 — `.changeset/feat-adapter-ollama-implement.md`                                                                                                                                                                                                 |

## 10. Out of scope

- **Streaming** — Ollama supports `stream: true`; v0.1 ships non-streaming. Streaming lands in v0.4.
- **Tool calling** — Ollama has it for some models; TierFall integration lands in v0.4 per AC.
- **Structured output (JSON mode)** — Ollama supports `format: 'json'`; not exposed at v0.1 since `supportsStructuredOutput: false`.
- **Embeddings** — `/api/embeddings` is a different endpoint; out of scope for #5.
- **Per-request timeout override** — fixed 30s for v0.1; future config knob.
- **API-key forwarding** — Ollama doesn't authenticate. `config.apiKey` is accepted (for parity) and ignored.

## 11. Risks + deviations

- **Service-container model pull is slow.** Mitigation: `qwen2.5:0.5b` (~400MB) instead of `llama3.2:3b` (~2GB).
- **GitHub Actions service container + ollama pull may flake intermittently.** Mitigation: `continue-on-error: true` initially; promote to required after stability proven.
- **Unit tests rely on `jest.spyOn(global, 'fetch')`.** This works in Node 24 with ts-jest's ESM preset, but the spyOn target is the global; tests must restore after each case (`afterEach(() => jest.restoreAllMocks())`).
- **`prompt_eval_count` may be missing on cached prompts** — coalesced to 0 to avoid NaN propagation. Documented in CLAUDE.md.
- **AC says "run in CI via the demo's Compose service".** Deviation noted: we use a fresh service container per CI run with a smaller model, not the demo's Compose stack. Same effective coverage; better CI ergonomics.

## 12. References

- Ollama API docs: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
- `packages/core/src/errors.ts` — `ProviderUnavailableError`, `CapabilityMismatchError`
- `packages/core/src/types.ts` — `LLMRequest`, `LLMResponse`, `LLMUsage`
- Existing skeleton: `packages/adapter-ollama/src/adapter.ts`
