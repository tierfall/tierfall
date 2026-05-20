# Core Integration Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `packages/core/test/integration.test.ts` — six scenarios exercising real `Router` + real `DefaultPolicy` with mocked adapters via `fakeAdapter` / `throwingAdapter` from `test/helpers/adapters.ts`.

**Architecture:** Single new test file. No source changes. Builds a 3-adapter stack (premium / cheap / local) via an inline `makeStack` helper; each scenario configures throws or successes per adapter and asserts both `LLMResponse.tier` and `fallChain` shape.

**Tech Stack:** TypeScript 6.0.3, Jest 29.7.0 + ts-jest 29.4.10 (ESM via `--experimental-vm-modules`).

**Spec:** `docs/superpowers/specs/2026-05-20-core-integration-test-design.md`
**Tracked issue:** [#15](https://github.com/tierfall/tierfall/issues/15)
**Branch:** `test/core-integration`

---

## File map

| File                                     | Operation | Responsibility                                                 |
| ---------------------------------------- | --------- | -------------------------------------------------------------- |
| `packages/core/test/integration.test.ts` | Create    | 6 scenarios + inline `makeStack` helper + capability templates |

No source changes. No changeset (test-only — API surface unchanged).

---

## Constraints recap

- No `any` outside test files (test files have a narrow exemption — we still don't need it here).
- No `// eslint-disable*`. No `// @ts-*`.
- All commits signed off (`git commit -s`). Never `--no-verify`.
- Stay on `test/core-integration`. Single commit.
- `core:test` must end green (gating).

---

## Task 1: Write the integration test file

**Files:**

- Create: `packages/core/test/integration.test.ts`

- [ ] **Step 1: Write the file**

```ts
import type { Adapter, AdapterCapability, LLMRequest } from '../src/index.js';
import { DefaultPolicy, Router } from '../src/index.js';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  NoTierAvailableError,
  ProviderUnavailableError,
} from '../src/errors.js';
import { fakeAdapter } from './helpers/adapters.js';

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

function makeStack(opts?: {
  premiumComplete?: Adapter['complete'];
  cheapComplete?: Adapter['complete'];
  localComplete?: Adapter['complete'];
}): readonly Adapter[] {
  return [
    fakeAdapter('premium', 'premium-cloud', {
      capability: PREMIUM_CAP,
      ...(opts?.premiumComplete ? { complete: opts.premiumComplete } : {}),
    }),
    fakeAdapter('cheap', 'cheap-cloud', {
      capability: CHEAP_CAP,
      ...(opts?.cheapComplete ? { complete: opts.cheapComplete } : {}),
    }),
    fakeAdapter('local', 'on-device', {
      capability: LOCAL_CAP,
      ...(opts?.localComplete ? { complete: opts.localComplete } : {}),
    }),
  ];
}

const baseRequest: LLMRequest = {
  model: 'auto',
  messages: [{ role: 'user', content: 'Integration scenario.' }],
};

describe('Router + DefaultPolicy integration (closes #15)', () => {
  it('closes #15: happy path — premium succeeds, no fall', async () => {
    const stack = makeStack();
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    const response = await router.complete(baseRequest);
    expect(response.tier).toBe('premium-cloud');
    expect(response.fallChain).toEqual([]);
  });

  it('closes #15: ProviderUnavailableError on premium → falls to cheap', async () => {
    const stack = makeStack({
      premiumComplete: () => Promise.reject(new ProviderUnavailableError('premium down')),
    });
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    const response = await router.complete(baseRequest);
    expect(response.tier).toBe('cheap-cloud');
    expect(response.fallChain).toHaveLength(1);
    expect(response.fallChain[0]).toMatchObject({
      adapterName: 'premium',
      tier: 'premium-cloud',
      reason: 'provider-unavailable',
      detail: 'premium down',
    });
  });

  it('closes #15: budget filter excludes premium and cheap; local serves with empty fallChain', async () => {
    // Premium est cost = 5/1M*500 + 15/1M*500 = 0.0025+0.0075 = 0.01
    // Cheap   est cost = 0.5/1M*500 + 1.5/1M*500 = 0.00025+0.00075 = 0.001
    // Local   est cost = 0 (null/null)
    // Cap 0.0001 excludes premium and cheap, keeps local.
    const stack = makeStack();
    const request: LLMRequest = { ...baseRequest, maxCostUSD: 0.0001 };
    const ordered = new DefaultPolicy().evaluate(request, stack);
    expect(ordered.map((a) => a.name)).toEqual(['local']);

    const router = new Router(ordered);
    const response = await router.complete(request);
    expect(response.tier).toBe('on-device');
    expect(response.fallChain).toEqual([]);
  });

  it('closes #15: capability filter narrows to premium; premium throws → NoTierAvailableError', async () => {
    const stack = makeStack({
      premiumComplete: () =>
        Promise.reject(new ProviderUnavailableError('premium down (tools required)')),
    });
    const request: LLMRequest = { ...baseRequest, requires: { tools: true } };
    const ordered = new DefaultPolicy().evaluate(request, stack);
    expect(ordered.map((a) => a.name)).toEqual(['premium']);

    const router = new Router(ordered);
    await expect(router.complete(request)).rejects.toBeInstanceOf(NoTierAvailableError);
    const caught = await router.complete(request).catch((e: unknown) => e);
    const err = caught as NoTierAvailableError;
    expect(err.fallChain).toHaveLength(1);
    expect(err.fallChain[0]).toMatchObject({
      adapterName: 'premium',
      reason: 'provider-unavailable',
    });
  });

  it('closes #15: all three adapters throw (one per error class) → NoTierAvailableError with full chain', async () => {
    const stack = makeStack({
      premiumComplete: () => Promise.reject(new ProviderUnavailableError('p down')),
      cheapComplete: () => Promise.reject(new BudgetExceededError('cheap over')),
      localComplete: () => Promise.reject(new CapabilityMismatchError('no tools')),
    });
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    await expect(router.complete(baseRequest)).rejects.toBeInstanceOf(NoTierAvailableError);
    const caught = await router.complete(baseRequest).catch((e: unknown) => e);
    const err = caught as NoTierAvailableError;
    expect(err.fallChain).toHaveLength(3);
    expect(err.fallChain.map((d) => d.reason)).toEqual([
      'provider-unavailable',
      'budget',
      'capability',
    ]);
    expect(err.fallChain.map((d) => d.adapterName)).toEqual(['premium', 'cheap', 'local']);
  });

  it('closes #15: untyped error mid-cascade → falls with reason "unknown"', async () => {
    const stack = makeStack({
      premiumComplete: () => Promise.reject(new TypeError('boom')),
    });
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    const response = await router.complete(baseRequest);
    expect(response.tier).toBe('cheap-cloud');
    expect(response.fallChain).toHaveLength(1);
    expect(response.fallChain[0]?.reason).toBe('unknown');
    expect(response.fallChain[0]?.detail).toContain('boom');
  });
});
```

**Note on `makeStack` spread pattern:** `tsconfig.base.json` has `exactOptionalPropertyTypes: true`, which means `{ complete: undefined }` is NOT the same as `{}` in TypeScript's view. The conditional spread `...(opts?.premiumComplete ? { complete: opts.premiumComplete } : {})` is required to avoid passing `complete: undefined` to `fakeAdapter`. Don't simplify this to `complete: opts?.premiumComplete` — the type checker will reject it.

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @tierfall/core test 2>&1 | grep -E "(PASS|FAIL|Tests:|integration)" | head`
Expected: `integration.test.ts` shows PASS; total count goes from 18 to 24.

If any test fails, **stop** and inspect. The pattern is mechanical — failures point at either (a) wrong cost math, (b) wrong assumption about policy filtering, (c) a real Router bug (which would be a regression in #2's work).

- [ ] **Step 3: Lint + typecheck**

```bash
pnpm exec eslint --max-warnings=0 packages/core
pnpm --filter @tierfall/core typecheck
```

Both: exit 0.

- [ ] **Step 4: Wall-clock check**

Run: `time pnpm --filter @tierfall/core test 2>&1 | tail -1`
Expected: `real` time < 5s for all 24 tests combined (the integration scenarios should add <100ms to whatever core's test suite already takes). The AC says <1s for the integration tests specifically; jest's startup overhead means a full `pnpm --filter test` run will be longer, but the relevant integration tests run in milliseconds.

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/integration.test.ts
git commit -s -m "test(core): integration test for router+policy interplay

Six scenarios exercising real Router + real DefaultPolicy with mocked
adapters:

1. happy path — premium succeeds, fallChain empty
2. ProviderUnavailableError on premium → falls to cheap
3. budget filter excludes premium AND cheap; local serves; fallChain empty
   (the filter happens before the router sees them — a filter is not a fall)
4. capability filter narrows to premium only; premium fails → NoTierAvailableError
5. all three throw (one per typed error class) → NoTierAvailableError with
   3-deep fallChain in attempt order
6. untyped error (TypeError) mid-cascade → falls with reason 'unknown'

makeStack lives inline in the integration file (not in test/helpers/)
because it bundles policy-specific capability templates and a 3-adapter
convention. The other test suites don't need this shape.

Closes #15."
```

---

## Final verification before opening the PR

- [ ] **Step 1: Branch state**

```bash
git log --oneline develop..HEAD
```

Expected: 2 commits (spec + this test commit).

- [ ] **Step 2: Full local check**

```bash
pnpm run check
```

Expected:

- lint: pass
- typecheck: pass
- test: only adapter-\* tests failing (issues #5/#6/#7/#8); core:test passes (now 24 total — 6 router + 11 policy + 1 adapter shape + 6 integration)
- build: pass

- [ ] **Step 3: Push branch**

```bash
git push -u origin test/core-integration
```

- [ ] **Step 4: Open PR**

````bash
gh pr create \
  --base develop \
  --head test/core-integration \
  --title "test(core): integration test exercising tier fall with mocked adapters" \
  --body-file - <<'BODY'
## Summary

Adds `packages/core/test/integration.test.ts` exercising the real Router + real DefaultPolicy composition. Closes #15.

## Acceptance criteria

- [x] `packages/core/test/integration.test.ts` simulates a 3-adapter setup (premium / cheap / local) with all four error paths
- [x] Test asserts both `LLMResponse.tier` AND full `fallChain` structure
- [x] Test runs in <1s with no network
- [x] Does NOT mock `Router` or `DefaultPolicy` — only adapters

## Six scenarios

1. happy path
2. ProviderUnavailableError on premium → falls to cheap
3. budget filter excludes premium AND cheap; local serves with empty fallChain
4. capability filter narrows to premium; premium fails → NoTierAvailableError
5. all three throw (one per typed error class) → NoTierAvailableError with 3-deep chain
6. untyped error mid-cascade → falls with reason 'unknown'

## How to validate

```bash
pnpm install
pnpm --filter @tierfall/core test    # 24 green
````

No source changes. No changeset (test-only).
BODY

````

- [ ] **Step 5: Watch CI**

Use Monitor on `gh pr checks <PR#>`. All 12 required checks should pass.

- [ ] **Step 6: Merge**

```bash
gh pr merge <PR#> --merge --delete-branch --admin
````

- [ ] **Step 7: Move board card to Done; pull develop**

```bash
source "$CLAUDE_JOB_DIR/project-ids.sh"
ITEM_ID=$(gh api graphql -f query='{ organization(login: "tierfall") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }' --jq '.data.organization.projectV2.items.nodes[] | select(.content.number==15) | .id')
gh project item-edit --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_DONE_ID" --project-id "$PROJECT_ID" > /dev/null

git checkout develop
git pull --ff-only origin develop
git log --oneline -5
```
