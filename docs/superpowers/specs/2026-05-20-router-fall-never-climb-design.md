# Router Fall-Never-Climb Implementation — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#2 — feat(core): implement Router fall-never-climb state machine](https://github.com/tierfall/tierfall/issues/2)
**Scope:** Implement the real `Router.complete` logic in `packages/core/src/router.ts`; ship 4 new tests; remove the `continue-on-error: true` scaffold debt from `ci.yml`'s `test` job.

---

## 1. Goal

Replace the `Router.complete` skeleton (currently throws "not yet implemented") with the production state machine described in the bootstrap design spec §3.2:

> "Fall, never climb." On failure, capability mismatch, or budget breach, the router falls to a **cheaper** tier, never a more expensive one. Climbing toward premium is explicit, observable, and never the default.

The implementation lives entirely inside `packages/core` — no adapter SDKs, no vendor dependencies. Verifiable by `pnpm why` returning nothing for `@anthropic-ai/sdk` / `openai` / `ollama` from `packages/core/`.

## 2. Inputs

The Router state is fixed at construction (already implemented in the scaffold):

```ts
class Router {
  readonly adapters: readonly Adapter[];
  constructor(adapters: readonly Adapter[]); // throws if empty
  complete(request: LLMRequest): Promise<LLMResponse>;
}
```

`adapters` is the ORDERED fallback list: index 0 is the most-preferred (typically premium-cloud), increasing index = cheaper. The Router does not reorder or filter — it consumes the list verbatim. (Filtering and ordering are issue #3's `DefaultPolicy.evaluate`.)

## 3. Algorithm

`Router.complete(request)`:

```
fallChain := []
for adapter in adapters (in order):
  try:
    response := await adapter.complete(request)
    return {
      ...response,
      tier: adapter.tier,                  // Router overrides
      fallChain: [...fallChain],            // Router overrides
    }
  catch err:
    fallChain.push(diagnoseError(adapter, err))
throw new NoTierAvailableError(
  "All adapters failed; see fallChain",
  fallChain,
)
```

Where `diagnoseError(adapter, err)` returns a `FallDiagnostic`:

| Caught error type          | `reason`                 |
| -------------------------- | ------------------------ |
| `BudgetExceededError`      | `'budget'`               |
| `CapabilityMismatchError`  | `'capability'`           |
| `ProviderUnavailableError` | `'provider-unavailable'` |
| Anything else              | `'unknown'`              |

`detail` is the error's `message` string. `tier` is `adapter.tier`. `adapterName` is `adapter.name`.

### Why typed-error mapping uses `instanceof`

Errors crossing package boundaries (esp. with ESM-CJS dual builds, multiple installs of `@tierfall/core`, etc.) can fail `instanceof` checks. Mitigate by ALSO checking `err.name`:

```ts
function reasonOf(err: unknown): FallDiagnostic['reason'] {
  if (err instanceof BudgetExceededError || (err as Error)?.name === 'BudgetExceededError')
    return 'budget';
  if (err instanceof CapabilityMismatchError || (err as Error)?.name === 'CapabilityMismatchError')
    return 'capability';
  if (
    err instanceof ProviderUnavailableError ||
    (err as Error)?.name === 'ProviderUnavailableError'
  )
    return 'provider-unavailable';
  return 'unknown';
}
```

Belt-and-suspenders. `name` is set as an `override readonly` on each error class (commit 4), so dual-build duplication doesn't break recognition.

## 4. Invariants (proven by construction)

- **No climbing.** The `for` loop only advances forward through `adapters`. There is no codepath that re-tries a lower-index adapter after a higher-index one succeeded or failed. Climbing is impossible without modifying the algorithm.
- **`fallChain` is append-only.** Once an entry is pushed, it stays. The returned chain is a snapshot at the success point (or full chain on total failure).
- **Adapter's claimed `tier` / `fallChain` are ignored.** The Router sets these on the returned `LLMResponse`. Buggy adapters cannot lie about which tier served a request.
- **Adapter errors don't escape (except `NoTierAvailableError`).** Any error from any adapter is caught and translated to a `FallDiagnostic`. Total failure is the only exit path that throws, and it throws exactly one type: `NoTierAvailableError`.

## 5. What the Router does NOT do (deferred to other issues)

- **Ordering / filtering by policy** — issue #3 (`DefaultPolicy`). Router stays dumb about why it got this adapter list.
- **Cost estimation / pre-flight budget check** — adapters self-report via `BudgetExceededError`. Pre-flight estimation is policy territory.
- **Streaming** — `LLMResponse` is non-streaming for v0.1. Streaming response shape lands in v0.4.
- **Concurrent / speculative attempts** — sequential by design. Speculation would weaken the cost-conscious contract.
- **Climbing override** — explicit climb (e.g., `forceTier: 'premium-cloud'`) is a future API. Out of scope for #2.

## 6. Test plan

### 6.1 Shared test helpers

Extract from `test/router.test.ts` into `packages/core/test/helpers/adapters.ts`:

```ts
import type { Adapter, AdapterCapability, Tier, LLMRequest, LLMResponse } from '../../src/index.js';

export function fakeAdapter(
  name: string,
  tier: Tier,
  overrides?: { capability?: Partial<AdapterCapability>; complete?: Adapter['complete'] },
): Adapter {
  /* ... */
}

export function throwingAdapter(name: string, tier: Tier, error: Error): Adapter {
  /* fakeAdapter that throws `error` from complete */
}
```

This file is consumed by `router.test.ts` and (anticipated) `policy.test.ts` and the integration test in issue #15.

### 6.2 Test cases

Keep the existing red TDD test (single-adapter happy path) and add four more:

| #   | Name                                | Setup                                                                                    | Assertion                                                                                                                                   |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | (existing) **happy path**           | `[premium]` succeeds                                                                     | `result.text === 'from premium'`; `result.tier === 'premium-cloud'`; `result.fallChain === []`                                              |
| 2   | **fall on provider unavailable**    | `[premium=throws ProviderUnavailableError, cheap=ok]`                                    | result from `cheap`; `fallChain.length === 1`; `fallChain[0].reason === 'provider-unavailable'`; `fallChain[0].adapterName === 'premium'`   |
| 3   | **fall on budget exceeded**         | `[premium=throws BudgetExceededError, on-device=ok]`                                     | result from `on-device`; chain has `reason: 'budget'`                                                                                       |
| 4   | **fall on capability mismatch**     | `[premium=throws CapabilityMismatchError, cheap=ok]`                                     | result from `cheap`; chain has `reason: 'capability'`                                                                                       |
| 5   | **all fail → NoTierAvailableError** | `[premium=throws ProviderUnavailable, cheap=throws Budget, on-device=throws Capability]` | `await` rejects with `NoTierAvailableError`; `error.fallChain.length === 3` with reasons `['provider-unavailable', 'budget', 'capability']` |

Optional sixth test (recommend including) — **untyped error falls with `reason: 'unknown'`**:

| 6 | **fall on unexpected error** | `[premium=throws TypeError('boom'), cheap=ok]` | result from `cheap`; chain has `reason: 'unknown'`; `detail.includes('boom')` |

All tests run with no network. Sub-100ms each.

### 6.3 Test discipline notes

- No `// eslint-disable*`, no `any` outside helpers. (Test files have a narrow `any` exemption per the spec; we still don't need it.)
- Each test names exactly one behavior and asserts both the tier landed on AND the fallChain shape.
- Test names include the issue close marker, e.g., `'closes #2: fall on provider unavailable'`, so a contributor reviewing them later sees the link.

## 7. Files changed

| File                                         | Type     | Notes                                                                                                                |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/router.ts`                | Modified | Replace skeleton with the algorithm in §3.                                                                           |
| `packages/core/test/helpers/adapters.ts`     | New      | Shared `fakeAdapter` + `throwingAdapter`.                                                                            |
| `packages/core/test/router.test.ts`          | Modified | Keep existing test, add 5 new (4 required + 1 unknown-error). Refactor to use helpers.                               |
| `.github/workflows/ci.yml`                   | Modified | **First commit of this PR.** Remove `continue-on-error: true` from the `test` job.                                   |
| `.changeset/feat-router-fall-never-climb.md` | New      | `@tierfall/core` patch (or minor — `pnpm changeset` will prompt; pick `minor` since this is real new functionality). |

No package.json changes. No new dependencies. No changes outside `packages/core/` except the CI fix and the changeset.

## 8. Commit plan

Targeting **4 commits** on the `feat/router-fall-never-climb` branch.

### Deviation from acceptance criteria

Issue #2's AC says "First commit of this PR removes `continue-on-error: true` from `ci.yml`'s `test` job." A naive removal makes CI red for every PR until issues #3, #5, #6, #7, #8 ALL land — because their red TDD tests still fail. That defeats the purpose of CI gating.

**Spirit-preserving alternative:** split the `test` job into two jobs by Nx project.

- **`test-core`** — runs `nx run-many --target=test --projects=core`. **No `continue-on-error`.** Required check on `develop`. This PR makes core's red tests green; from issue #2 onward, every PR must keep `test-core` green.
- **`test-rest`** — runs `nx run-many --target=test --exclude=core`. **Keeps `continue-on-error: true`** with TODO referring to **issue #8** (the last adapter implementation in the chain). When #8 closes, `test-rest` merges back into a single `test` job with no allowances.

This delivers the acceptance criterion's intent (real CI gating for what's implementable now) without the false-green compromise.

### Commits

1. **`ci: split test job into test-core + test-rest`** — single-file CI change. Updates branch protection's required-check list expectation in the PR description.
2. **`test(core): extract fakeAdapter/throwingAdapter helpers`** — pure refactor. Existing red test refactored to use new helpers; still red.
3. **`feat(core): implement Router fall-never-climb state machine`** — the real change. Existing red test goes green; 5 new tests added (4 required + 1 unknown-error bonus).
4. **`docs(core): TSDoc examples + changeset`** — `@example` blocks on `Router` (per constraint #15) + the `.changeset/feat-router-fall-never-climb.md` (`@tierfall/core` minor bump).

## 9. Acceptance criteria mapping

| AC from issue #2                                                                   | How met                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Happy path returns response with `tier: 'premium-cloud'` and `fallChain: []`       | Test #1 (existing), §3 algorithm                                                                                                          |
| `ProviderUnavailableError` triggers fall with `reason: 'provider-unavailable'`     | Test #2, §3 algorithm + `reasonOf()`                                                                                                      |
| `BudgetExceededError` triggers fall with `reason: 'budget'`                        | Test #3                                                                                                                                   |
| `CapabilityMismatchError` triggers fall with `reason: 'capability'`                | Test #4                                                                                                                                   |
| All adapters fail → `NoTierAvailableError` with full chain                         | Test #5, §3                                                                                                                               |
| Climbing impossible by construction                                                | §4 invariant; provable by inspection of the for-loop                                                                                      |
| Existing red test passes + ≥3 more covering each fall reason and no-tier-available | 5 total new tests; §6.2                                                                                                                   |
| First commit removes `continue-on-error: true`                                     | §8 commit 1 — REVISED: split into `test:core` (no continue-on-error) and `test:rest` (continue-on-error remains, TODO points to issue #8) |
| TSDoc on every exported symbol                                                     | Router has TSDoc already; add `@example` blocks per constraint #15                                                                        |
| Changeset added                                                                    | §7 — `.changeset/feat-router-fall-never-climb.md`, minor bump                                                                             |

## 10. Out of scope

- `DefaultPolicy.evaluate` — issue #3
- Adapter implementations — issues #5, #6, #7, #8
- `FallDiagnostic.format()` helper — issue #4
- Demo scenarios — issue #9
- Streaming response — v0.4
- Climbing override API — future

## 11. Risks

- **Adapter packages' tests stay red** because their `complete()` skeletons aren't implemented. CI's `test:core` is green; CI's `test:rest` continues with `continue-on-error: true`. This is documented in `ci.yml` and the PR description.
- **`instanceof` may fail in dual-package-hazard environments.** Mitigated by the `name`-string fallback in `reasonOf()` (§3).
- **No streaming** in v0.1; if anyone files an issue about streaming, point at v0.4.

## 12. References

- Bootstrap design spec: `docs/superpowers/specs/2026-05-20-tierfall-bootstrap-design.md` §3.2
- Bootstrap plan: `docs/superpowers/plans/2026-05-20-tierfall-bootstrap.md` §5 Issue #2
- AGENTS.md: gitnexus-generated, see for current symbol/relationship inventory
