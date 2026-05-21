# Core Integration Test — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#15 — test(core): integration test exercising tier fall with mocked adapters](https://github.com/tierfall/tierfall/issues/15)
**Scope:** Single new file `packages/core/test/integration.test.ts` exercising real `Router` + real `DefaultPolicy` together with mocked adapters.

---

## 1. Goal

After issues #2 and #3 landed Router and DefaultPolicy as real implementations, add a focused integration test that exercises their composition. The unit tests in `router.test.ts` and `policy.test.ts` cover each in isolation; this file catches regressions in the seams between them.

## 2. Constraints (from AC)

- **One file:** `packages/core/test/integration.test.ts`
- **Three-adapter setup:** premium / cheap / local, used across scenarios
- **All four error paths** exercised: `ProviderUnavailableError`, `BudgetExceededError`, `CapabilityMismatchError`, untyped errors (via `TypeError`)
- **Assert tier AND fallChain** on every scenario (not just one or the other)
- **<1s wall time, no network**
- **Real `Router`, real `DefaultPolicy`** — only adapters mocked

## 3. File structure

```ts
import { DefaultPolicy, Router } from '../src/index.js';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  NoTierAvailableError,
  ProviderUnavailableError,
} from '../src/errors.js';
import type { Adapter, AdapterCapability, LLMRequest } from '../src/index.js';
import { fakeAdapter, throwingAdapter } from './helpers/adapters.js';

// Per-tier capability templates that match a realistic three-tier setup
const PREMIUM_CAP: AdapterCapability = {
  /* high context, tools, cost ~$5/M */
};
const CHEAP_CAP: AdapterCapability = {
  /* mid context, no tools, cost ~$0.50/M */
};
const LOCAL_CAP: AdapterCapability = {
  /* low context, no tools, null cost */
};

function makeStack(opts?: {
  premiumComplete?: Adapter['complete'];
  cheapComplete?: Adapter['complete'];
  localComplete?: Adapter['complete'];
}): readonly Adapter[] {
  return [
    fakeAdapter('premium', 'premium-cloud', {
      capability: PREMIUM_CAP,
      complete: opts?.premiumComplete,
    }),
    fakeAdapter('cheap', 'cheap-cloud', {
      capability: CHEAP_CAP,
      complete: opts?.cheapComplete,
    }),
    fakeAdapter('local', 'on-device', {
      capability: LOCAL_CAP,
      complete: opts?.localComplete,
    }),
  ];
}

const baseRequest: LLMRequest = {
  /* ... */
};

describe('Router + DefaultPolicy integration (closes #15)', () => {
  // ... 6 tests
});
```

`makeStack` lives in the integration file (not in `test/helpers/`) because it bundles policy-specific capability shapes and a 3-adapter convention. Other tests don't need it.

## 4. Six scenarios

| #   | Name                                                             | Setup                                                                                                                 | Asserts                                                                                                                            |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **happy path**                                                   | all three adapters use default `complete` (succeed)                                                                   | `tier === 'premium-cloud'`; `fallChain === []`                                                                                     |
| 2   | **provider-down → fall to cheap**                                | premium throws `ProviderUnavailableError`, others default                                                             | `tier === 'cheap-cloud'`; `fallChain` length 1 with `{ adapterName: 'premium', reason: 'provider-unavailable' }`                   |
| 3   | **budget filter excludes cheap; falls to local**                 | `maxCostUSD: 0.0001` filters premium AND cheap (both above 0.0001 estimate); policy returns `[local]`; local succeeds | `tier === 'on-device'`; `fallChain === []` (filter, not fall)                                                                      |
| 4   | **capability filter to single adapter; premium fails → no-tier** | `requires.tools: true` filters to `[premium]` only; premium throws `ProviderUnavailableError`                         | rejects with `NoTierAvailableError`; `fallChain` length 1, `adapterName: 'premium'`, `reason: 'provider-unavailable'`              |
| 5   | **all three throw (one per error class)**                        | premium → `ProviderUnavailableError`, cheap → `BudgetExceededError`, local → `CapabilityMismatchError`                | rejects with `NoTierAvailableError`; `fallChain.length === 3`; reasons in order `['provider-unavailable', 'budget', 'capability']` |
| 6   | **untyped error mid-cascade**                                    | premium throws `TypeError('boom')`, cheap succeeds                                                                    | `tier === 'cheap-cloud'`; `fallChain[0].reason === 'unknown'`; `fallChain[0].detail.includes('boom')`                              |

Total: 6 tests.

## 5. Cost values for budget-filter test

Need numbers that make cheap fail the cap but local pass:

- `CHEAP_CAP.costPerMillionInputTokens = 0.50, costPerMillionOutputTokens = 1.50` → est cost (500+500 tokens) = `0.50/1M*500 + 1.50/1M*500 = 0.00025 + 0.00075 = 0.001`
- `PREMIUM_CAP.costPerMillionInputTokens = 5, costPerMillionOutputTokens = 15` → est `0.0025 + 0.0075 = 0.01`
- `LOCAL_CAP.costPerMillionInputTokens = null, costPerMillionOutputTokens = null` → est `0`

Cap of `0.0001` excludes premium (0.01) and cheap (0.001), keeps local (0). ✅

## 6. Capability templates

```ts
const PREMIUM_CAP: AdapterCapability = {
  contextWindowTokens: 200_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsStructuredOutput: true,
  costPerMillionInputTokens: 5,
  costPerMillionOutputTokens: 15,
};

const CHEAP_CAP: AdapterCapability = {
  contextWindowTokens: 32_000,
  supportsTools: false,
  supportsStreaming: true,
  supportsStructuredOutput: false,
  costPerMillionInputTokens: 0.5,
  costPerMillionOutputTokens: 1.5,
};

const LOCAL_CAP: AdapterCapability = {
  contextWindowTokens: 8_192,
  supportsTools: false,
  supportsStreaming: true,
  supportsStructuredOutput: false,
  costPerMillionInputTokens: null,
  costPerMillionOutputTokens: null,
};
```

## 7. Orchestration helper

Each test follows the same pattern:

```ts
const stack = makeStack({ /* throw configs */ });
const policy = new DefaultPolicy();
const ordered = policy.evaluate(request, stack);
const router = new Router(ordered);  // throws if ordered is empty
const response = await router.complete(request);
expect(response.tier).toBe(...);
expect(response.fallChain).toMatchObject(...);
```

For tests asserting on `NoTierAvailableError`:

```ts
await expect(router.complete(request)).rejects.toBeInstanceOf(NoTierAvailableError);
// Then re-call to capture the error for fallChain assertions
const caught = await router.complete(request).catch((e: unknown) => e);
const err = caught as NoTierAvailableError;
expect(err.fallChain).toHaveLength(N);
```

No special teardown. No timers. Tests are synchronous except for the `await`.

## 8. Files changed

| File                                     | Operation | Notes               |
| ---------------------------------------- | --------- | ------------------- |
| `packages/core/test/integration.test.ts` | Create    | 6 tests, ~150 lines |

No source changes. No changeset (test-only — the published API surface is unchanged).

## 9. Commit plan

**1 commit:** `test(core): integration test for router+policy interplay`. Body explains the 6 scenarios + the design choice of inline `makeStack` (vs adding to shared helpers).

## 10. Acceptance criteria mapping

| AC from issue #15                                                                                                        | How met                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/test/integration.test.ts` simulates a 3-adapter setup (premium / cheap / local) with all four error paths | `makeStack` provides the 3 adapters; scenarios 2/3/5/6 hit the four error paths (ProviderUnavailable, Budget via policy filter, Capability via policy filter + scenario 5, unknown via scenario 6) |
| Test asserts both `LLMResponse.tier` AND full `fallChain` structure                                                      | Every scenario asserts both                                                                                                                                                                        |
| <1s with no network                                                                                                      | Pure in-memory; no I/O                                                                                                                                                                             |
| Does NOT mock `Router` or `DefaultPolicy` — only adapters                                                                | The pattern uses `new Router(...)` and `new DefaultPolicy()` directly                                                                                                                              |

## 11. Out of scope

- Real adapter implementations — covered in issues #5/#6/#8
- Streaming integration — v0.4
- Performance benchmarks — not relevant at this scale
- Property-based testing (fast-check etc.) — overkill for v0.1
