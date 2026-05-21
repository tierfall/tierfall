# DefaultPolicy Evaluator Implementation — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#3 — feat(core): implement declarative Policy evaluator](https://github.com/tierfall/tierfall/issues/3)
**Scope:** Implement `DefaultPolicy.evaluate` in `packages/core/src/policy.ts`. Filter adapters by request requirements (capability + budget) and sort survivors by tier-index ascending (premium → on-device).

---

## 1. Goal

Replace the `DefaultPolicy.evaluate` skeleton (throws "not yet implemented") with the production evaluator. The function is **pure**: given a request and a list of adapters, returns the ordered subset the Router should attempt.

`Policy` stays **standalone** — not integrated into `Router` for v0.1. Callers orchestrate manually:

```ts
const policy = new DefaultPolicy();
const ordered = policy.evaluate(request, allAdapters);
const router = new Router(ordered);
const response = await router.complete(request);
```

Router-integration is deferred to a future API addition. Decision stands from issue #2's brainstorm: "Don't bake policy into Router prematurely."

## 2. Inputs

- `request: LLMRequest` — the same shape the Router consumes (see `packages/core/src/types.ts`). Optional `requires` and `maxCostUSD` drive filtering.
- `adapters: readonly Adapter[]` — caller's full registry. Order is NOT meaningful here (policy reorders); but stable sort means within a tier, input order is preserved.

## 3. Output

`readonly Adapter[]` — filtered + sorted, possibly empty.

The result is consumed by `new Router(result)`. **If `result.length === 0`, the Router constructor throws** (`"Router requires at least one adapter"`). That's the correct semantics: the caller passed no matching adapters. Document this in TSDoc.

## 4. Algorithm

```
evaluate(request, adapters):
  filtered := []
  for adapter in adapters:
    if passesAllFilters(adapter, request):
      filtered.push(adapter)
  return stableSort(filtered, ascending by TIERS.indexOf(adapter.tier))
```

### 4.1 Filter predicate

An adapter passes if **all** of the following hold (AND, short-circuit-friendly):

| Trigger                                                  | Adapter is excluded when…                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `request.requires?.minContextWindowTokens !== undefined` | `adapter.capability.contextWindowTokens < request.requires.minContextWindowTokens` (strict `<` per AC "below") |
| `request.requires?.tools === true`                       | `adapter.capability.supportsTools === false`                                                                   |
| `request.requires?.streaming === true`                   | `adapter.capability.supportsStreaming === false`                                                               |
| `request.requires?.structuredOutput === true`            | `adapter.capability.supportsStructuredOutput === false`                                                        |
| `request.maxCostUSD !== undefined`                       | `estimateCost(adapter.capability) > request.maxCostUSD` (strict `>`; equality survives)                        |

When a `requires` flag is `false` or absent, that filter is a no-op (every adapter passes that filter).

### 4.2 Cost estimation

Per AC, assume an average of **500 input + 500 output tokens** for the request. Used solely to compute a cost-cap fit; not exposed elsewhere.

```ts
function estimateCost(cap: AdapterCapability): number {
  const inputCost = ((cap.costPerMillionInputTokens ?? 0) / 1_000_000) * 500;
  const outputCost = ((cap.costPerMillionOutputTokens ?? 0) / 1_000_000) * 500;
  return inputCost + outputCost;
}
```

- `null` cost (free tier — usually `on-device`) → 0.
- Result is in USD as a `number`.

The 500+500 figure is a deliberate simplification for v0.1. A future issue can introduce per-request token estimation (using a tokenizer like `tiktoken`). Mention this in TSDoc.

### 4.3 Sort

```ts
filtered.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
```

`Array.prototype.sort` is stable per ES2019. Two adapters at the same tier preserve their input order. Document the stability guarantee in TSDoc.

## 5. Invariants

- **Pure function.** No I/O, no globals, no mutation of inputs. Deterministic given `(request, adapters)`.
- **Filter excludes; never includes.** An adapter that doesn't match a `requires` flag stays excluded — `DefaultPolicy` never overrides a "no" from capability.
- **Sort never reorders within tier.** Stable.
- **Empty result is valid.** Caller decides what to do (typically: the Router constructor will throw, which surfaces the empty-list problem to the caller immediately).

## 6. What the policy does NOT do (deferred)

- **Router integration** — future API addition. Out of scope for #3.
- **Per-request token estimation** — fixed 500+500 for v0.1.
- **Climbing override / preferred-tier hint** — Router doesn't climb; the policy can't either. Deferred to whichever future issue introduces explicit climbing.
- **Adapter health / latency history** — pure static evaluation. No state.
- **Cost-per-token from request size** — would require tokenizer; future.

## 7. Test plan

### 7.1 Scaffold-debt removal (first commit)

`packages/core/jest.config.js` currently has `testPathIgnorePatterns` excluding `policy.test.ts` (added in issue #2's PR to keep `test-core` green). **First commit of this PR removes that entry.** From that point on, the policy test is in the gated `test-core` job again — and it's red TDD until the implementation lands later in this PR.

### 7.2 Test cases (10 total)

| #   | Name                                                 | Setup                                                                                              | Assertion                                             |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | (refactored existing) **empty input → empty output** | `evaluate(req, [])`                                                                                | `[]`                                                  |
| 2   | **sort: no filters**                                 | input `[on-device, premium, cheap]`, no requires                                                   | output `[premium, cheap, on-device]`                  |
| 3   | **stable sort within tier**                          | input `[premiumA, premiumB]`                                                                       | output `[premiumA, premiumB]` (input order preserved) |
| 4   | **filter: minContextWindowTokens**                   | `requires.minContextWindowTokens: 16000`; one adapter has 8192, another 32768                      | only the 32768 survives                               |
| 5   | **filter: tools**                                    | `requires.tools: true`; one adapter `supportsTools: false`, another `true`                         | only the true survives                                |
| 6   | **filter: streaming**                                | `requires.streaming: true`; symmetric setup                                                        | only the supporting one survives                      |
| 7   | **filter: structuredOutput**                         | `requires.structuredOutput: true`; symmetric                                                       | only the supporting one survives                      |
| 8   | **filter: maxCostUSD (cap rejects expensive)**       | premium @ $30/M in + $60/M out → est cost $0.045/req, cap `0.001`                                  | premium excluded                                      |
| 9   | **filter: maxCostUSD (equality survives)**           | adapter whose estimated cost == cap                                                                | adapter included (strict `>` semantics)               |
| 10  | **filters combine (AND)**                            | `requires.tools: true` AND `requires.minContextWindowTokens: 100000`; 3 adapters with partial fits | only the one passing both survives                    |
| 11  | **all filtered out → empty result**                  | impossible-to-meet requires                                                                        | `[]`                                                  |

These reuse `fakeAdapter` from `packages/core/test/helpers/adapters.ts` (created in issue #2). The `overrides.capability?: Partial<AdapterCapability>` parameter accepts the per-test capability values directly.

### 7.3 Test discipline

- Tests named `'closes #3: ...'` for grep-ability
- No `any`, no eslint-disable, no @ts-\* (same constraints as everywhere)
- Each test asserts on the EXACT output array (length AND order), not just length

## 8. Files changed

| File                                          | Operation         | Notes                                                      |
| --------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `packages/core/jest.config.js`                | Modify (Commit 1) | Remove `testPathIgnorePatterns` entry for `policy.test.ts` |
| `packages/core/src/policy.ts`                 | Modify (Commit 2) | Real `DefaultPolicy.evaluate` + `estimateCost` helper      |
| `packages/core/test/policy.test.ts`           | Modify (Commit 2) | Refactor + 10 new test cases                               |
| `.changeset/feat-default-policy-evaluator.md` | Create (Commit 3) | `@tierfall/core` minor bump                                |

No new dependencies. No changes to Router. No vendor SDK touches.

## 9. Commit plan

**3 commits** on the `feat/default-policy-evaluator` branch:

1. **`chore(core): drop testPathIgnorePatterns for policy.test.ts`** — single-line removal in `jest.config.js`. `test-core` will fail in CI until commit 2 lands; that's the TDD pattern preserved.
2. **`feat(core): implement DefaultPolicy.evaluate`** — algorithm + tests. `test-core` goes green.
3. **`docs(core): TSDoc examples + changeset`** — `@example` blocks on `DefaultPolicy` (per constraint #15) + `.changeset/feat-default-policy-evaluator.md`.

## 10. Acceptance criteria mapping

| AC from issue #3                                                                                           | How met                                                                           |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Without `request.requires`, returns adapters sorted by tier-index                                          | Test #2; §4 algorithm                                                             |
| `requires.minContextWindowTokens` excludes adapters below                                                  | Test #4; §4.1 filter table                                                        |
| `requires.tools: true` excludes adapters where `supportsTools: false`                                      | Test #5                                                                           |
| Same for `streaming` and `structuredOutput`                                                                | Tests #6, #7                                                                      |
| `request.maxCostUSD` excludes adapters whose lowest possible cost exceeds the cap (500+500 token estimate) | Tests #8, #9; §4.2 cost formula                                                   |
| Existing red test passes; add ≥4 more                                                                      | 10 new tests in §7.2 (well over the requirement)                                  |
| TSDoc on every exported symbol                                                                             | Existing TSDoc on `Policy` and `DefaultPolicy`; add `@example` blocks in commit 3 |
| Changeset added                                                                                            | Commit 3 — `@tierfall/core` minor, linked-mode bumps all four published packages  |

## 11. Out of scope

- `Router` constructor changes — issue beyond #3 to add policy integration
- Token-based cost estimation — uses fixed 500+500 for v0.1
- Adapter implementations — issues #5/#6/#7/#8
- `FallDiagnostic.format()` helper — issue #4
- Demo scenarios — issue #9

## 12. Risks

- **`Array.prototype.sort` stability** — ES2019+ guarantees stable sort, and Node 24 LTS is well past that. Documented in TSDoc as a depended-on property.
- **Cost-cap edge case at exact equality** — strict `>` semantics means equality survives. Test #9 locks this in.
- **Empty result blows up downstream Router construction** — by design. Documented in TSDoc.

## 13. References

- Issue #2's spec at `docs/superpowers/specs/2026-05-20-router-fall-never-climb-design.md` (Policy-Router boundary decision)
- `packages/core/src/tier.ts` — `TIERS` const array and `Tier` type
- `packages/core/src/types.ts` — `LLMRequest.requires` shape
- `packages/core/test/helpers/adapters.ts` — `fakeAdapter` test helper
