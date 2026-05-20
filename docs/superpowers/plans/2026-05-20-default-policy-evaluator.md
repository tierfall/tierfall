# DefaultPolicy Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `DefaultPolicy.evaluate` as a pure filter-and-sort over adapters. Replace the skeleton in `packages/core/src/policy.ts`; add 10 tests; drop the scaffold-debt `testPathIgnorePatterns` entry that was added in issue #2's PR.

**Architecture:** Filter survivors via `request.requires` + `request.maxCostUSD`, then stable-sort by `TIERS.indexOf(tier)` ascending (premium → on-device). Empty result is valid — downstream `new Router([])` throws, which is the correct semantics.

**Tech Stack:** TypeScript 6.0.3 strict, Jest 29.7.0 + ts-jest 29.4.10, Nx 22.7.2, changesets 2.31.0.

**Spec:** `docs/superpowers/specs/2026-05-20-default-policy-evaluator-design.md`
**Tracked issue:** [#3](https://github.com/tierfall/tierfall/issues/3)
**Branch:** `feat/default-policy-evaluator`

---

## File map

| File                                          | Operation         | Responsibility                                                                          |
| --------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `packages/core/jest.config.js`                | Modify (Commit 1) | Remove the `testPathIgnorePatterns` entry that was added in #2 to skip `policy.test.ts` |
| `packages/core/src/policy.ts`                 | Modify (Commit 2) | Replace skeleton with real `DefaultPolicy.evaluate` + private `estimateCost` helper     |
| `packages/core/test/policy.test.ts`           | Modify (Commit 2) | Refactor existing test + add 10 new tests using shared `fakeAdapter` helper             |
| `.changeset/feat-default-policy-evaluator.md` | Create (Commit 3) | `@tierfall/core` minor bump                                                             |

No other files. No new deps. No Router changes.

---

## Constraints recap (must hold throughout)

- No `any` outside test files. No `// eslint-disable*`. No `// @ts-*`.
- All commits signed off (`git commit -s`). Never `--no-verify`.
- Pre-commit hook runs `lint-staged + tsc --noEmit` (not tests).
- Stay on `feat/default-policy-evaluator`. Each commit passes pre-commit on its own.
- `test-core` (now a required check on `develop`) must be green at the end of this PR.

---

## Commit 1 — Drop the testPathIgnorePatterns scaffold-debt

### Task 1.1: Remove the policy.test.ts exclusion from Jest config

**Files:**

- Modify: `packages/core/jest.config.js`

- [ ] **Step 1: Edit the file**

Current content:

```js
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  // TODO(#3): remove once DefaultPolicy.evaluate is implemented and policy.test.ts goes green.
  // Excluding the red TDD policy test lets `test-core` in CI gate the router suite without
  // requiring issue #3 to land first. Issue #3's PR drops this entry as its first commit.
  testPathIgnorePatterns: ['/node_modules/', '\\.policy\\.test\\.ts$', 'policy\\.test\\.ts$'],
  collectCoverageFrom: ['src/**/*.ts'],
};
```

Replace with:

```js
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
};
```

- [ ] **Step 2: Run tests — `policy.test.ts` should now be in scope and FAILING (skeleton still throws)**

Run: `pnpm --filter @tierfall/core test 2>&1 | tail -10`
Expected: 1 failed (`policy.test.ts` — `DefaultPolicy.evaluate is not yet implemented — see issue #3`), 7 passed.

This is the desired state: red TDD test is back in scope; impl in Commit 2 turns it green.

- [ ] **Step 3: Commit**

```bash
git add packages/core/jest.config.js
git commit -s -m "chore(core): drop testPathIgnorePatterns for policy.test.ts

Removes the scaffold-debt exclusion added in issue #2's PR. With
policy.test.ts back in scope, test-core in CI will fail until
Commit 2 lands the real DefaultPolicy.evaluate — that's the
intended TDD pattern.

Refs #3."
```

---

## Commit 2 — Implement `DefaultPolicy.evaluate` + add 10 tests

### Task 2.1: Replace the test file with the 10 test cases

**Files:**

- Modify: `packages/core/test/policy.test.ts`

- [ ] **Step 1: Replace the file's contents**

```ts
import { DefaultPolicy } from '../src/policy.js';
import type { LLMRequest } from '../src/index.js';
import { fakeAdapter } from './helpers/adapters.js';

const baseRequest: LLMRequest = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
};

describe('DefaultPolicy (closes #3)', () => {
  it('closes #3: empty adapter list returns empty result', () => {
    const policy = new DefaultPolicy();
    expect(policy.evaluate(baseRequest, [])).toEqual([]);
  });

  it('closes #3: sort by tier-index ascending (premium first → on-device last)', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('local', 'on-device'),
      fakeAdapter('premium', 'premium-cloud'),
      fakeAdapter('cheap', 'cheap-cloud'),
    ];
    const result = policy.evaluate(baseRequest, input);
    expect(result.map((a) => a.name)).toEqual(['premium', 'cheap', 'local']);
  });

  it('closes #3: stable sort preserves input order within a tier', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('premiumA', 'premium-cloud'),
      fakeAdapter('premiumB', 'premium-cloud'),
    ];
    const result = policy.evaluate(baseRequest, input);
    expect(result.map((a) => a.name)).toEqual(['premiumA', 'premiumB']);
  });

  it('closes #3: filter by minContextWindowTokens excludes adapters below', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('big', 'premium-cloud', { capability: { contextWindowTokens: 32768 } }),
      fakeAdapter('small', 'on-device', { capability: { contextWindowTokens: 8192 } }),
    ];
    const result = policy.evaluate(
      { ...baseRequest, requires: { minContextWindowTokens: 16000 } },
      input,
    );
    expect(result.map((a) => a.name)).toEqual(['big']);
  });

  it('closes #3: filter by tools=true excludes adapters where supportsTools is false', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('with-tools', 'premium-cloud', { capability: { supportsTools: true } }),
      fakeAdapter('no-tools', 'on-device', { capability: { supportsTools: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { tools: true } }, input);
    expect(result.map((a) => a.name)).toEqual(['with-tools']);
  });

  it('closes #3: filter by streaming=true excludes adapters where supportsStreaming is false', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('with-stream', 'premium-cloud', { capability: { supportsStreaming: true } }),
      fakeAdapter('no-stream', 'on-device', { capability: { supportsStreaming: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { streaming: true } }, input);
    expect(result.map((a) => a.name)).toEqual(['with-stream']);
  });

  it('closes #3: filter by structuredOutput=true excludes adapters where supportsStructuredOutput is false', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('structured', 'premium-cloud', {
        capability: { supportsStructuredOutput: true },
      }),
      fakeAdapter('plain', 'on-device', { capability: { supportsStructuredOutput: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { structuredOutput: true } }, input);
    expect(result.map((a) => a.name)).toEqual(['structured']);
  });

  it('closes #3: filter by maxCostUSD excludes adapters whose 500+500-token cost exceeds the cap', () => {
    const policy = new DefaultPolicy();
    const input = [
      // ($30/M * 500) + ($60/M * 500) = $0.015 + $0.030 = $0.045 per request — exceeds $0.001
      fakeAdapter('expensive', 'premium-cloud', {
        capability: { costPerMillionInputTokens: 30, costPerMillionOutputTokens: 60 },
      }),
      // null/null → 0 cost
      fakeAdapter('free', 'on-device'),
    ];
    const result = policy.evaluate({ ...baseRequest, maxCostUSD: 0.001 }, input);
    expect(result.map((a) => a.name)).toEqual(['free']);
  });

  it('closes #3: maxCostUSD comparison is strict greater-than (equality survives)', () => {
    const policy = new DefaultPolicy();
    // ($2/M * 500) + ($2/M * 500) = $0.001 + $0.001 = $0.002 per request — equals cap
    const input = [
      fakeAdapter('on-cap', 'premium-cloud', {
        capability: { costPerMillionInputTokens: 2, costPerMillionOutputTokens: 2 },
      }),
    ];
    const result = policy.evaluate({ ...baseRequest, maxCostUSD: 0.002 }, input);
    expect(result.map((a) => a.name)).toEqual(['on-cap']);
  });

  it('closes #3: filters combine with AND — adapter must pass every requires field', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('only-tools', 'premium-cloud', {
        capability: { supportsTools: true, contextWindowTokens: 4000 },
      }),
      fakeAdapter('only-context', 'cheap-cloud', {
        capability: { supportsTools: false, contextWindowTokens: 200_000 },
      }),
      fakeAdapter('both', 'on-device', {
        capability: { supportsTools: true, contextWindowTokens: 100_000 },
      }),
    ];
    const result = policy.evaluate(
      { ...baseRequest, requires: { tools: true, minContextWindowTokens: 100_000 } },
      input,
    );
    expect(result.map((a) => a.name)).toEqual(['both']);
  });

  it('closes #3: all adapters filtered out → empty result (caller-driven empty downstream)', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('no-tools-a', 'premium-cloud', { capability: { supportsTools: false } }),
      fakeAdapter('no-tools-b', 'cheap-cloud', { capability: { supportsTools: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { tools: true } }, input);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests — ALL 11 should FAIL right now**

Run: `pnpm --filter @tierfall/core test 2>&1 | grep -E "(PASS|FAIL|Tests:)" | head`
Expected: 11 failed in `policy.test.ts`, all failing with `DefaultPolicy.evaluate is not yet implemented`.

(Plus 6 router tests + 1 adapter test still pass — those are untouched.)

This proves the new tests run and hit the right symbol.

### Task 2.2: Implement `DefaultPolicy.evaluate`

**Files:**

- Modify: `packages/core/src/policy.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import type { Adapter } from './adapter.js';
import type { AdapterCapability } from './tier.js';
import { TIERS } from './tier.js';
import type { LLMRequest } from './types.js';

/**
 * Declarative policy evaluator: matches a request against available adapters
 * and produces the ordered fallback sequence the Router will attempt.
 */
export interface Policy {
  evaluate(request: LLMRequest, adapters: readonly Adapter[]): readonly Adapter[];
}

/**
 * Estimate the USD cost of a single request given an adapter's per-token pricing.
 * Uses a fixed 500 input + 500 output token budget for v0.1 — a deliberate
 * simplification. A future issue can introduce per-request tokenizer-based
 * estimation. `null` cost (free tier, typically on-device) maps to zero.
 */
function estimateCost(capability: AdapterCapability): number {
  const inputCost = ((capability.costPerMillionInputTokens ?? 0) / 1_000_000) * 500;
  const outputCost = ((capability.costPerMillionOutputTokens ?? 0) / 1_000_000) * 500;
  return inputCost + outputCost;
}

function passesFilters(adapter: Adapter, request: LLMRequest): boolean {
  const { capability } = adapter;
  const requires = request.requires;

  if (requires !== undefined) {
    if (
      requires.minContextWindowTokens !== undefined &&
      capability.contextWindowTokens < requires.minContextWindowTokens
    ) {
      return false;
    }
    if (requires.tools === true && !capability.supportsTools) {
      return false;
    }
    if (requires.streaming === true && !capability.supportsStreaming) {
      return false;
    }
    if (requires.structuredOutput === true && !capability.supportsStructuredOutput) {
      return false;
    }
  }

  if (request.maxCostUSD !== undefined && estimateCost(capability) > request.maxCostUSD) {
    return false;
  }

  return true;
}

/**
 * Default policy: filter by `request.requires` and `request.maxCostUSD`, then
 * stable-sort survivors by tier-index ascending (premium-cloud first, on-device
 * last). Result is pure — no I/O, no mutation of inputs.
 */
export class DefaultPolicy implements Policy {
  evaluate(request: LLMRequest, adapters: readonly Adapter[]): readonly Adapter[] {
    const filtered = adapters.filter((adapter) => passesFilters(adapter, request));
    return [...filtered].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
  }
}
```

- [ ] **Step 2: Build the package**

Run: `pnpm --filter @tierfall/core build`
Expected: exit 0; `dist/index.d.ts` updated with the new exports' types.

- [ ] **Step 3: Lint + typecheck**

Run:

```bash
pnpm exec eslint --max-warnings=0 packages/core
pnpm --filter @tierfall/core typecheck
```

Both: exit 0.

- [ ] **Step 4: Run the tests — all 11 policy tests should pass**

Run: `pnpm --filter @tierfall/core test 2>&1 | grep -E "(PASS|FAIL|Tests:)" | head`
Expected: `Tests: 18 passed, 18 total` (6 router + 11 policy + 1 adapter shape). All three test files green.

If any policy test fails, **stop**. Don't paper over it — either the algorithm or the test is wrong.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/policy.ts packages/core/test/policy.test.ts
git commit -s -m "feat(core): implement DefaultPolicy.evaluate

Pure filter-and-sort over adapters:
- Filter by request.requires.{minContextWindowTokens, tools, streaming,
  structuredOutput} — adapter must pass every active filter (AND)
- Filter by request.maxCostUSD using a 500-input + 500-output token
  estimate; strict > comparison (equality survives)
- Stable sort by TIERS.indexOf(tier) ascending (premium → on-device)
- Empty result is valid; downstream new Router([]) throws clearly

Cost estimation uses a fixed token budget for v0.1; a future issue
can introduce tokenizer-based per-request estimation.

11 tests total: empty input, sort order, stable within tier, four
capability filters, two cost-cap edge cases (over and on-cap),
AND-combined filters, all-filtered-out empty result.

Closes #3."
```

---

## Commit 3 — TSDoc `@example` blocks + changeset

### Task 3.1: Add `@example` blocks to `DefaultPolicy` and `Policy`

**Files:**

- Modify: `packages/core/src/policy.ts`

- [ ] **Step 1: Replace the JSDoc above `DefaultPolicy`**

Find the existing JSDoc:

```ts
/**
 * Default policy: filter by `request.requires` and `request.maxCostUSD`, then
 * stable-sort survivors by tier-index ascending (premium-cloud first, on-device
 * last). Result is pure — no I/O, no mutation of inputs.
 */
```

Replace with:

````ts
/**
 * Default policy: filter by `request.requires` and `request.maxCostUSD`, then
 * stable-sort survivors by tier-index ascending (premium-cloud first, on-device
 * last). Result is pure — no I/O, no mutation of inputs.
 *
 * **Empty result.** If every adapter is filtered out, `evaluate` returns `[]`.
 * Downstream `new Router([])` throws `"Router requires at least one adapter"` —
 * that's the correct semantics: surface the impossible-to-satisfy request to
 * the caller immediately instead of silently choosing wrong.
 *
 * **Stable sort.** `Array.prototype.sort` is stable per ES2019, and Node 24 LTS
 * is well past that. Two adapters at the same tier preserve their input order.
 *
 * @example
 * Sort by tier only (no filters):
 * ```ts
 * import { DefaultPolicy, Router } from '@tierfall/core';
 *
 * const policy = new DefaultPolicy();
 * const ordered = policy.evaluate(request, [localAdapter, premiumAdapter, cheapAdapter]);
 * const router = new Router(ordered);
 * const response = await router.complete(request);
 * // ordered === [premiumAdapter, cheapAdapter, localAdapter]
 * ```
 *
 * @example
 * Filter by capability + budget:
 * ```ts
 * const policy = new DefaultPolicy();
 * const ordered = policy.evaluate(
 *   {
 *     model: 'auto',
 *     messages: [{ role: 'user', content: 'Build a 200k-token report.' }],
 *     requires: { tools: true, minContextWindowTokens: 100_000 },
 *     maxCostUSD: 0.10,
 *   },
 *   allAdapters,
 * );
 *
 * if (ordered.length === 0) {
 *   throw new Error('No adapter can satisfy this request — relax the constraints.');
 * }
 * const router = new Router(ordered);
 * const response = await router.complete(request);
 * ```
 */
````

- [ ] **Step 2: Verify build emits `@example` to dist .d.ts**

Run: `pnpm --filter @tierfall/core build && grep -c '@example' packages/core/dist/index.d.ts`
Expected: at least `4` (2 from Router added in #2, 2 from DefaultPolicy added here).

- [ ] **Step 3: Verify ESLint + typecheck still clean**

Run:

```bash
pnpm exec eslint --max-warnings=0 packages/core
pnpm --filter @tierfall/core typecheck
```

Both: exit 0.

### Task 3.2: Add the changeset

**Files:**

- Create: `.changeset/feat-default-policy-evaluator.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
'@tierfall/core': minor
---

Implement the `DefaultPolicy.evaluate` declarative evaluator. Given a request and an adapter list, returns the filtered + sorted subset the Router should attempt:

- Filters by `request.requires.{minContextWindowTokens, tools, streaming, structuredOutput}` (AND)
- Filters by `request.maxCostUSD` using a 500-input + 500-output token budget
- Stable-sorts survivors by tier-index ascending (premium-cloud → on-device)
- Empty result surfaces impossible-to-satisfy requests via the Router constructor's empty-list throw

Closes #3.
```

- [ ] **Step 2: Verify changeset status**

Run: `pnpm exec changeset status 2>&1 | head -15`
Expected: `@tierfall/core` listed at `minor`; lockstep-linked adapter packages also shown.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/policy.ts .changeset/feat-default-policy-evaluator.md
git commit -s -m "docs(core): @example blocks on DefaultPolicy; changeset for #3

TSDoc examples cover sort-only and filter+budget orchestration with
Router. Empty-result + stable-sort guarantees explicitly called out.

Changeset: @tierfall/core minor (linked publish bumps all four
published packages together).

Refs #3."
```

---

## Final verification before opening the PR

- [ ] **Step 1: Branch state**

```bash
git log --oneline develop..HEAD
```

Expected: 4 commits (1 spec + 3 implementation).

- [ ] **Step 2: Full local check**

```bash
pnpm run check
```

Expected:

- lint: pass (exit 0)
- typecheck: pass
- test: only `adapter-anthropic:test`, `adapter-ollama:test`, `adapter-openai-compatible:test` failing (red TDD for issues #5/#6/#7/#8). `core:test` PASSES — both router AND policy now green.
- build: pass

If `core:test` fails, **stop**. The policy implementation or tests have a real bug.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/default-policy-evaluator
```

- [ ] **Step 4: Open the PR**

````bash
gh pr create \
  --base develop \
  --head feat/default-policy-evaluator \
  --title "feat(core): implement declarative Policy evaluator" \
  --body-file - <<'BODY'
## Summary

Implements `DefaultPolicy.evaluate` per the design spec at `docs/superpowers/specs/2026-05-20-default-policy-evaluator-design.md`.

Closes #3. Drops the `testPathIgnorePatterns` scaffold-debt added in PR #24's commit.

## Acceptance criteria

- [x] Without `request.requires`, returns adapters sorted by tier-index (premium-cloud first → on-device last)
- [x] `requires.minContextWindowTokens` excludes adapters below
- [x] `requires.tools: true` excludes adapters where `supportsTools: false`
- [x] Same for `streaming` and `structuredOutput`
- [x] `request.maxCostUSD` excludes adapters whose 500+500-token estimated cost exceeds the cap (strict `>`)
- [x] Existing red test passes + 10 new tests covering each filter
- [x] TSDoc `@example` blocks on `DefaultPolicy`
- [x] Changeset added (`@tierfall/core` minor)

## Implementation notes

- **Stable sort** guarantee documented in TSDoc (Node 24 LTS, ES2019+).
- **Cost estimation** uses a fixed 500+500 token budget for v0.1 — a future issue can introduce tokenizer-based per-request estimation.
- **Empty result** is valid; the downstream `new Router([])` throws and surfaces the impossible-to-satisfy request to the caller immediately.
- **Policy stays standalone** — no `Router` constructor change. Future API addition can introduce `new Router(adapters, policy)` ergonomic shortcut.

## How to validate locally

```bash
pnpm install
pnpm --filter @tierfall/core test    # 18 green (6 router + 11 policy + 1 adapter shape)
pnpm exec nx test --projects=core    # this is what test-core runs in CI; passes
pnpm run check                       # only red tests are adapter-* (issues #5/#6/#7/#8)
````

## Removes scaffold debt

- `packages/core/jest.config.js` no longer skips `policy.test.ts`. With this PR merged, `policy.test.ts` is back in the gated `test-core` suite.
  BODY

```

- [ ] **Step 5: Watch CI**

Use Monitor with the same shape as previous PRs, watching `gh pr checks <PR#>` until all checks complete. Expect all 11 required checks green:

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
test-core: pass ← new behavior gated here
test-rest: pass (via continue-on-error)
typecheck: pass

````

If `test-core` fails, **stop** and investigate; this is the required check.

- [ ] **Step 6: Merge**

```bash
gh pr merge <PR#> --merge --delete-branch --admin
````

- [ ] **Step 7: Move board card to Done and pull develop**

```bash
source "$CLAUDE_JOB_DIR/project-ids.sh"
ITEM_ID=$(gh api graphql -f query='{ organization(login: "tierfall") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }' --jq '.data.organization.projectV2.items.nodes[] | select(.content.number==3) | .id')
gh project item-edit --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_DONE_ID" --project-id "$PROJECT_ID" > /dev/null

git checkout develop
git pull --ff-only origin develop
git log --oneline -5
```
