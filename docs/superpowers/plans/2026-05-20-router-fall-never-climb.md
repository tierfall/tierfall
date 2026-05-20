# Router Fall-Never-Climb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `Router.complete` as a fall-never-climb state machine in `packages/core`, ship 5 new tests, refactor test helpers, and split the CI `test` job to gate core's tests as a required check.

**Architecture:** Sequential for-loop over `adapters[]`. Each `adapter.complete()` call is tried; on any thrown error, the router pushes a `FallDiagnostic` and moves to the next adapter. Success returns `{...response, tier: adapter.tier, fallChain: [...captured]}`. Total failure throws `NoTierAvailableError`. Climbing is impossible by construction (loop only advances).

**Tech Stack:** TypeScript 6.0.3 strict, Jest 29.7.0 + ts-jest 29.4.10 (ESM via `--experimental-vm-modules`), Nx 22.7.2, changesets 2.31.0.

**Spec:** `docs/superpowers/specs/2026-05-20-router-fall-never-climb-design.md`
**Tracked issue:** [#2](https://github.com/tierfall/tierfall/issues/2)
**Branch:** `feat/router-fall-never-climb`

---

## File map

| File                                         | Operation             | Responsibility                                                                                                          |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                   | Modify (Commit 1)     | Split single `test` job → `test-core` (required, no continue-on-error) + `test-rest` (continue-on-error stays until #8) |
| `packages/core/test/helpers/adapters.ts`     | Create (Commit 2)     | Shared `fakeAdapter` + `throwingAdapter` test fixtures                                                                  |
| `packages/core/test/router.test.ts`          | Modify (Commit 2 + 3) | Refactor to use helpers (Commit 2); add 5 new tests (Commit 3)                                                          |
| `packages/core/src/router.ts`                | Modify (Commit 3)     | Replace skeleton with the fall-never-climb algorithm                                                                    |
| `.changeset/feat-router-fall-never-climb.md` | Create (Commit 4)     | `@tierfall/core` minor bump for the new behavior                                                                        |

Branch protection on `develop` must also be updated near merge time to swap `test` → `test-core` in the required-checks list — that's a `gh api` call, not a file commit.

---

## Constraints recap (must hold throughout)

- No `any` outside test files. No `// eslint-disable*`. No `// @ts-*`.
- All commits signed off (`git commit -s`). Never `--no-verify`.
- Pre-commit hook runs `lint-staged + tsc --noEmit` (NOT tests — they're red TDD).
- Stay on `feat/router-fall-never-climb`. Each commit passes pre-commit on its own.

---

## Commit 1 — Split CI `test` job into `test-core` + `test-rest`

### Task 1.1: Replace the `test` job in `.github/workflows/ci.yml`

**Files:**

- Modify: `.github/workflows/ci.yml` (replace the single `test:` job block with two new ones)

- [ ] **Step 1: Replace the test job block**

Open `.github/workflows/ci.yml`. Find the existing block:

```yaml
test:
  runs-on: ubuntu-latest
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
    # NOTE: at scaffold-close, the adapter and router/policy tests are intentionally
    # red (TDD). Until issues #2/#3/#5/#6/#8 land, this job is allowed to fail —
    # PR reviewers verify failures match the expected red tests.
    # TODO(#2): remove `continue-on-error` once adapter/router/policy tests are green.
    - run: pnpm exec nx run-many --target=test --parallel=3
      continue-on-error: true
```

Replace it with:

```yaml
test-core:
  runs-on: ubuntu-latest
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
    - run: pnpm exec nx run-many --target=test --projects=core --parallel=3

test-rest:
  runs-on: ubuntu-latest
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
    # Red TDD tests for adapter-* and policy stay red until issues #5/#6/#7/#8 land.
    # TODO(#8): remove continue-on-error when the last adapter implementation merges.
    - run: pnpm exec nx run-many --target=test --exclude=core --parallel=3
      continue-on-error: true
```

- [ ] **Step 2: Verify YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Verify Prettier is happy**

Run: `pnpm exec prettier --check .github/workflows/ci.yml`
Expected: exit 0 (no warnings)

If it complains, run `pnpm exec prettier --write .github/workflows/ci.yml` first.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -s -m "ci: split test job into test-core (gated) + test-rest (TDD)

test-core runs nx test --projects=core with no continue-on-error.
This becomes the required check on develop. Closes the spirit of
issue #2's first-commit AC without false-greens.

test-rest runs nx test --exclude=core with continue-on-error: true
until issue #8 (the last adapter implementation) closes the chain.
TODO(#8) marker in the file points contributors at the removal trigger.

Required branch-protection update (out-of-band): swap 'test' for
'test-core' in develop's required_status_checks.contexts."
```

---

## Commit 2 — Extract test helpers; refactor existing red test

### Task 2.1: Create the shared test helpers file

**Files:**

- Create: `packages/core/test/helpers/adapters.ts`

- [ ] **Step 1: Write the helpers file**

Create `packages/core/test/helpers/adapters.ts`:

```ts
import type { Adapter, AdapterCapability, Tier } from '../../src/index.js';

/**
 * Test-only helper. Constructs an `Adapter` with sensible defaults. Override
 * any field via `overrides`. The default `complete` resolves to a response
 * whose `text` is `"from ${name}"` and whose `tier` matches the adapter — this
 * lets tests assert which adapter actually served the request.
 */
export function fakeAdapter(
  name: string,
  tier: Tier,
  overrides: {
    capability?: Partial<AdapterCapability>;
    complete?: Adapter['complete'];
  } = {},
): Adapter {
  const baseCapability: AdapterCapability = {
    contextWindowTokens: 8192,
    supportsTools: false,
    supportsStreaming: false,
    supportsStructuredOutput: false,
    costPerMillionInputTokens: null,
    costPerMillionOutputTokens: null,
  };
  const capability: AdapterCapability = {
    ...baseCapability,
    ...overrides.capability,
  };
  const complete: Adapter['complete'] =
    overrides.complete ??
    (() =>
      Promise.resolve({
        text: `from ${name}`,
        tier,
        model: name,
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 },
        fallChain: [],
      }));
  return { name, tier, capability, complete };
}

/**
 * Test-only helper. Constructs an `Adapter` whose `complete()` always rejects
 * with the given error. Used to assert the router's fall behavior on each
 * thrown error class.
 */
export function throwingAdapter(name: string, tier: Tier, error: Error): Adapter {
  return fakeAdapter(name, tier, {
    complete: () => Promise.reject(error),
  });
}
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm exec eslint --max-warnings=0 packages/core/test/helpers/adapters.ts`
Expected: exit 0

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm --filter @tierfall/core typecheck`
Expected: exit 0

### Task 2.2: Refactor existing red test to use helpers (test still fails)

**Files:**

- Modify: `packages/core/test/router.test.ts`

- [ ] **Step 1: Replace the file's contents**

The existing file has an inline `fakeAdapter` helper and one red test. Replace its full content with:

```ts
import { Router } from '../src/router.js';
import { fakeAdapter } from './helpers/adapters.js';

describe('Router (closes #2)', () => {
  it('completes via the first adapter when it succeeds', async () => {
    const router = new Router([fakeAdapter('premium', 'premium-cloud')]);
    const result = await router.complete({
      model: 'whatever',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from premium');
    expect(result.tier).toBe('premium-cloud');
    expect(result.fallChain).toEqual([]);
  });
});
```

This test was already red against the skeleton. After this refactor it remains red — confirms helper extraction didn't change test semantics.

- [ ] **Step 2: Verify lint + typecheck still pass workspace-wide**

Run:

```bash
pnpm exec eslint --max-warnings=0 .
pnpm exec nx run-many --target=typecheck --projects=core
```

Both: exit 0.

- [ ] **Step 3: Run the test — it should still FAIL with the skeleton message**

Run: `pnpm --filter @tierfall/core test 2>&1 | tail -20`
Expected: `router.test.ts` fails with `Router.complete is not yet implemented — see issue #2`. (policy.test.ts also fails as before — unrelated.)

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/helpers/adapters.ts packages/core/test/router.test.ts
git commit -s -m "test(core): extract fakeAdapter/throwingAdapter helpers

Pure refactor. Existing red router test continues to fail with the
same skeleton message; helpers are now consumable by router/policy/
integration tests in the same package (and exportable later if other
packages need them via a /test-utils sub-export).

Refs #2."
```

---

## Commit 3 — Implement Router fall-never-climb + add 5 new tests

### Task 3.1: Add the 5 new tests to `packages/core/test/router.test.ts`

**Files:**

- Modify: `packages/core/test/router.test.ts`

- [ ] **Step 1: Replace the file's contents**

After this step the file holds 6 tests total (1 existing + 5 new). Replace its full content with:

```ts
import { Router } from '../src/router.js';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  NoTierAvailableError,
  ProviderUnavailableError,
} from '../src/errors.js';
import { fakeAdapter, throwingAdapter } from './helpers/adapters.js';

describe('Router (closes #2)', () => {
  it('completes via the first adapter when it succeeds', async () => {
    const router = new Router([fakeAdapter('premium', 'premium-cloud')]);
    const result = await router.complete({
      model: 'whatever',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from premium');
    expect(result.tier).toBe('premium-cloud');
    expect(result.fallChain).toEqual([]);
  });

  it('closes #2: fall on ProviderUnavailableError', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new ProviderUnavailableError('down')),
      fakeAdapter('cheap', 'cheap-cloud'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from cheap');
    expect(result.tier).toBe('cheap-cloud');
    expect(result.fallChain).toHaveLength(1);
    expect(result.fallChain[0]).toMatchObject({
      tier: 'premium-cloud',
      adapterName: 'premium',
      reason: 'provider-unavailable',
      detail: 'down',
    });
  });

  it('closes #2: fall on BudgetExceededError', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new BudgetExceededError('over budget')),
      fakeAdapter('on-device', 'on-device'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from on-device');
    expect(result.tier).toBe('on-device');
    expect(result.fallChain).toHaveLength(1);
    expect(result.fallChain[0]?.reason).toBe('budget');
  });

  it('closes #2: fall on CapabilityMismatchError', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new CapabilityMismatchError('no tools')),
      fakeAdapter('cheap', 'cheap-cloud'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from cheap');
    expect(result.fallChain[0]?.reason).toBe('capability');
  });

  it('closes #2: all adapters fail → NoTierAvailableError with full chain', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new ProviderUnavailableError('p down')),
      throwingAdapter('cheap', 'cheap-cloud', new BudgetExceededError('cheap over')),
      throwingAdapter('on-device', 'on-device', new CapabilityMismatchError('no tools')),
    ]);

    await expect(
      router.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(NoTierAvailableError);

    const caught = await router
      .complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(NoTierAvailableError);
    const err = caught as NoTierAvailableError;
    expect(err.fallChain).toHaveLength(3);
    expect(err.fallChain.map((d) => d.reason)).toEqual([
      'provider-unavailable',
      'budget',
      'capability',
    ]);
    expect(err.fallChain.map((d) => d.adapterName)).toEqual(['premium', 'cheap', 'on-device']);
  });

  it('closes #2: untyped error falls with reason "unknown"', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new TypeError('boom')),
      fakeAdapter('cheap', 'cheap-cloud'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.fallChain[0]?.reason).toBe('unknown');
    expect(result.fallChain[0]?.detail).toContain('boom');
  });
});
```

- [ ] **Step 2: Run the tests — they should ALL FAIL right now**

Run: `pnpm --filter @tierfall/core test -- router.test.ts 2>&1 | tail -30`
Expected: 6 failing tests, each failing with `Router.complete is not yet implemented`.

This proves the new tests run, exercise the correct surface, and fail for the right reason (the missing implementation, not test bugs).

### Task 3.2: Implement `Router.complete`

**Files:**

- Modify: `packages/core/src/router.ts`

- [ ] **Step 1: Replace the file contents**

Replace `packages/core/src/router.ts` entirely with:

```ts
import type { Adapter } from './adapter.js';
import type { FallDiagnostic, LLMRequest, LLMResponse } from './types.js';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  NoTierAvailableError,
  ProviderUnavailableError,
} from './errors.js';

/**
 * Maps a caught error to the corresponding `FallDiagnostic.reason`.
 *
 * Uses both `instanceof` (the fast path for normal in-process throws) and a
 * `name`-string fallback. The fallback matters when an error crosses package
 * boundaries in dual-package-hazard environments — `instanceof` can fail
 * silently when two installs of `@tierfall/core` produce two distinct
 * `Error` subclasses with the same name. Both checks are cheap; doing both
 * is defense in depth.
 */
function reasonOf(err: unknown): FallDiagnostic['reason'] {
  if (err instanceof BudgetExceededError) return 'budget';
  if (err instanceof CapabilityMismatchError) return 'capability';
  if (err instanceof ProviderUnavailableError) return 'provider-unavailable';
  if (err instanceof Error) {
    switch (err.name) {
      case 'BudgetExceededError':
        return 'budget';
      case 'CapabilityMismatchError':
        return 'capability';
      case 'ProviderUnavailableError':
        return 'provider-unavailable';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}

function detailOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Router state machine: "Fall, never climb."
 *
 * Given an ordered list of adapters (premium → on-device), the router attempts
 * the first; on any thrown error, it records a `FallDiagnostic` and tries the
 * next. Climbing toward a more expensive tier requires an explicit policy
 * override and is not implemented in v0.1.
 *
 * The router OVERRIDES `LLMResponse.tier` and `LLMResponse.fallChain` so that
 * the returned values reflect the router's view of the world — the adapter
 * that actually served the request, and the chain of attempts it made.
 */
export class Router {
  readonly adapters: readonly Adapter[];

  constructor(adapters: readonly Adapter[]) {
    if (adapters.length === 0) {
      throw new Error('Router requires at least one adapter');
    }
    this.adapters = adapters;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const fallChain: FallDiagnostic[] = [];
    for (const adapter of this.adapters) {
      try {
        const response = await adapter.complete(request);
        return {
          ...response,
          tier: adapter.tier,
          fallChain: [...fallChain],
        };
      } catch (err: unknown) {
        fallChain.push({
          tier: adapter.tier,
          adapterName: adapter.name,
          reason: reasonOf(err),
          detail: detailOf(err),
        });
      }
    }
    throw new NoTierAvailableError('All adapters failed; see fallChain for diagnostics', fallChain);
  }
}
```

- [ ] **Step 2: Build the package**

Run: `pnpm --filter @tierfall/core build`
Expected: exit 0; emits `packages/core/dist/index.js`, `index.cjs`, `index.d.ts`, `index.d.cts`.

- [ ] **Step 3: Lint and typecheck**

Run:

```bash
pnpm exec eslint --max-warnings=0 packages/core
pnpm --filter @tierfall/core typecheck
```

Both: exit 0. If lint catches a new unsafe-assignment warning from `{...response, tier: ..., fallChain: ...}`, it means TypeScript inferred `response` as something containing `any`. That indicates the `Adapter.complete` return type isn't propagating; investigate before continuing.

- [ ] **Step 4: Run the tests — all 6 should now pass**

Run: `pnpm --filter @tierfall/core test 2>&1 | tail -20`
Expected: 6 tests passing in `router.test.ts`. `policy.test.ts` will still have 1 failing test (issue #3, separate scope).

If any router test fails, **stop**. Don't paper over it — the algorithm or test is wrong.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/router.ts packages/core/test/router.test.ts
git commit -s -m "feat(core): implement Router fall-never-climb state machine

Sequential for-loop over the constructed adapter list. Each adapter
is tried in order; on any thrown error the router pushes a
FallDiagnostic and advances to the next. The returned LLMResponse
has tier and fallChain overridden by the router so they reflect
which adapter actually served the request and what preceded it.
On total failure, throws NoTierAvailableError carrying the full chain.

Error classification handles both typed adapter errors (Budget /
Capability / ProviderUnavailable) and untyped throws (mapped to
reason: 'unknown'). instanceof + name-string fallback survives the
dual-package hazard.

Climbing is impossible by construction: the for-loop only advances.

Tests: 6 total (1 happy path + 4 per-reason falls + 1 total-failure
+ 1 untyped-error). All green.

Closes #2."
```

---

## Commit 4 — TSDoc `@example` blocks + changeset

### Task 4.1: Add `@example` blocks to Router class TSDoc

**Files:**

- Modify: `packages/core/src/router.ts`

- [ ] **Step 1: Edit `packages/core/src/router.ts` — append two `@example` blocks to the Router class TSDoc**

Find the existing JSDoc block above `export class Router`:

```ts
/**
 * Router state machine: "Fall, never climb."
 *
 * Given an ordered list of adapters (premium → on-device), the router attempts
 * the first; on any thrown error, it records a `FallDiagnostic` and tries the
 * next. Climbing toward a more expensive tier requires an explicit policy
 * override and is not implemented in v0.1.
 *
 * The router OVERRIDES `LLMResponse.tier` and `LLMResponse.fallChain` so that
 * the returned values reflect the router's view of the world — the adapter
 * that actually served the request, and the chain of attempts it made.
 */
```

Replace it with:

````ts
/**
 * Router state machine: "Fall, never climb."
 *
 * Given an ordered list of adapters (premium → on-device), the router attempts
 * the first; on any thrown error, it records a `FallDiagnostic` and tries the
 * next. Climbing toward a more expensive tier requires an explicit policy
 * override and is not implemented in v0.1.
 *
 * The router OVERRIDES `LLMResponse.tier` and `LLMResponse.fallChain` so that
 * the returned values reflect the router's view of the world — the adapter
 * that actually served the request, and the chain of attempts it made.
 *
 * @example
 * Basic three-tier setup (premium → cheap → local):
 * ```ts
 * import { Router } from '@tierfall/core';
 * import { AnthropicAdapter } from '@tierfall/adapter-anthropic';
 * import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
 * import { OllamaAdapter } from '@tierfall/adapter-ollama';
 *
 * const router = new Router([
 *   new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-sonnet-4-7' }),
 *   new OpenAICompatibleAdapter({ baseUrl: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY!, model: 'deepseek-chat' }),
 *   new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama3.2:3b' }),
 * ]);
 *
 * const response = await router.complete({
 *   model: 'auto',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * console.log(response.text);             // adapter-produced content
 * console.log(response.tier);             // tier of the adapter that served
 * console.log(response.fallChain.length); // 0 if first adapter succeeded
 * ```
 *
 * @example
 * Inspecting a fall chain after a failure cascade:
 * ```ts
 * try {
 *   const response = await router.complete(request);
 *   for (const fall of response.fallChain) {
 *     console.warn(`fell from ${fall.tier} (${fall.adapterName}): ${fall.reason} — ${fall.detail}`);
 *   }
 * } catch (err) {
 *   if (err instanceof NoTierAvailableError) {
 *     console.error('All adapters failed:', err.fallChain);
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 */
````

- [ ] **Step 2: Verify build still produces correct .d.ts**

Run: `pnpm --filter @tierfall/core build && grep -c '@example' packages/core/dist/index.d.ts`
Expected: `2`

- [ ] **Step 3: Verify ESLint and typecheck**

Run:

```bash
pnpm exec eslint --max-warnings=0 packages/core
pnpm --filter @tierfall/core typecheck
```

Both: exit 0.

### Task 4.2: Add the changeset

**Files:**

- Create: `.changeset/feat-router-fall-never-climb.md`

- [ ] **Step 1: Write the changeset file**

Create `.changeset/feat-router-fall-never-climb.md`:

```markdown
---
'@tierfall/core': minor
---

Implement the Router fall-never-climb state machine. Adapters in the constructor's list are attempted in order; on `BudgetExceededError`, `CapabilityMismatchError`, `ProviderUnavailableError`, or any unexpected error, the router falls to the next adapter and records a `FallDiagnostic` on the response's `fallChain`. When all adapters fail, throws `NoTierAvailableError` carrying the full chain.

Closes #2.
```

(In linked mode, only `@tierfall/core` needs to be named — the lockstep group bumps together at publish time.)

- [ ] **Step 2: Verify the changeset is recognized**

Run: `pnpm exec changeset status 2>&1 | head -20`
Expected: the changeset is listed; bump for `@tierfall/core` (minor) is shown alongside the lockstep-linked adapter packages.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/router.ts .changeset/feat-router-fall-never-climb.md
git commit -s -m "docs(core): @example blocks on Router; changeset for #2

TSDoc examples cover the basic three-tier setup and inspecting a
fall chain after a cascade. Visible in dist/index.d.ts after build.

Changeset: @tierfall/core minor (linked publish bumps all four
published packages together per .changeset/config.json).

Refs #2."
```

---

## Final verification before opening the PR

- [ ] **Step 1: Branch state**

```bash
git log --oneline develop..HEAD
```

Expected: 4 commits plus the spec-doc commit (`0a7b38d`) → 5 commits total.

- [ ] **Step 2: Full local check**

```bash
pnpm run check
```

Expected:

- lint: 0 (passes)
- typecheck: 0 (passes)
- test: non-zero — adapter packages' tests still red (TDD), policy still red. **Verify the only failing tests are the expected red TDD ones** (in `adapter-anthropic`, `adapter-ollama`, `adapter-openai-compatible`, and `policy.test.ts`). Router's 6 tests must all be green.
- build: 0 (passes)

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/router-fall-never-climb
```

- [ ] **Step 4: Open the PR**

````bash
gh pr create \
  --base develop \
  --head feat/router-fall-never-climb \
  --title "feat(core): implement Router fall-never-climb state machine" \
  --body-file - <<'BODY'
## Summary

Implements the Router state machine per the design spec at
`docs/superpowers/specs/2026-05-20-router-fall-never-climb-design.md`.

Closes #2.

## Acceptance criteria

- [x] Happy path returns response with `tier: 'premium-cloud'` and `fallChain: []`
- [x] `ProviderUnavailableError` triggers fall with `reason: 'provider-unavailable'`
- [x] `BudgetExceededError` triggers fall with `reason: 'budget'`
- [x] `CapabilityMismatchError` triggers fall with `reason: 'capability'`
- [x] All adapters fail → `NoTierAvailableError` with full chain
- [x] Climbing impossible by construction (for-loop only advances)
- [x] Existing red test passes + 5 new tests covering each fall reason and no-tier-available (1 extra for untyped errors)
- [x] First commit addresses the `continue-on-error: true` scaffold debt (deviation: see below)
- [x] TSDoc `@example` blocks on `Router`
- [x] Changeset added (`@tierfall/core` minor; linked-mode bumps all published packages)

## Deviation from issue #2 AC (declared upfront)

The AC said "First commit removes `continue-on-error: true` from `ci.yml`'s `test` job." A naive removal would keep CI red on every PR until issues #3/#5/#6/#7/#8 ALL land. Instead the first commit **splits** the job:

- `test-core` — `nx test --projects=core`, **no `continue-on-error`** — required check on `develop`. This PR makes it green.
- `test-rest` — `nx test --exclude=core`, **`continue-on-error` stays** with TODO pointing at issue #8.

Branch-protection required-checks list also needs updating from `test` → `test-core`. That's an out-of-band `gh api` call documented below.

## How to validate locally

```bash
pnpm install
pnpm --filter @tierfall/core test    # 6 router tests + 1 adapter shape test, all green
pnpm run check                       # only red tests are the still-TDD adapter/policy ones
````

## Branch protection update (maintainer must run before merge)

```bash
gh api -X PUT "repos/tierfall/tierfall/branches/develop/protection" --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "test-core", "build", "publint", "attw", "knip", "CodeQL"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

Mirror the same change on `main` (with `enforce_admins: true` per the bootstrap spec).
BODY

````

- [ ] **Step 5: Update branch protection (after PR opens, before merge)**

The new `test-core` check needs to exist in CI history before branch protection can require it. Wait for CI to run, then:

```bash
gh api -X PUT "repos/tierfall/tierfall/branches/develop/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "test-core", "build", "publint", "attw", "knip", "CodeQL"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON

# Mirror on main:
gh api -X PUT "repos/tierfall/tierfall/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "test-core", "build", "publint", "attw", "knip", "CodeQL"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
````

- [ ] **Step 6: Verify CI green; merge**

```bash
gh pr checks --watch              # or use Monitor for the events
gh pr merge --merge --delete-branch --admin   # solo project; per plan §4.3.6
```

Board card for #2 auto-moves (or manually move) to Done.

- [ ] **Step 7: Update local develop**

```bash
git checkout develop
git pull --ff-only origin develop
git log --oneline -8
```
