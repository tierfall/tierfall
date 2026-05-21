# Demo Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/demo-cli/src/main.ts` stub with four scenarios showcasing fall-never-climb behavior against real adapters. Six new/modified source files. Docker-compose end-to-end smoke is the verification.

**Architecture:** Six files in `apps/demo-cli/src/` — `main.ts` orchestrator, `banner.ts` printing helpers, `build-adapters.ts` env-driven selection, four scenario files. Each scenario is self-contained (constructs its own Router invocation). Demo exits 0 when all four scenarios produced their expected outcomes.

**Tech Stack:** TypeScript 6.0.3, Node 24, `@tierfall/core` + all three adapters + their presets. No new dependencies. Docker Compose for the end-to-end run.

**Spec:** `docs/superpowers/specs/2026-05-20-demo-scenarios-design.md`
**Tracked issue:** [#9](https://github.com/tierfall/tierfall/issues/9)
**Branch:** `feat/demo-scenarios`

---

## File map

| File                                           | Operation | Responsibility                                                          |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `apps/demo-cli/src/main.ts`                    | Rewrite   | Entry — prints banner, runs 4 scenarios sequentially, exits per outcome |
| `apps/demo-cli/src/banner.ts`                  | Create    | `printTopBanner`, `printScenarioHeader`, `printResult` helpers          |
| `apps/demo-cli/src/build-adapters.ts`          | Create    | Env → `{ premium?, cheap?, local }` adapter set; logs skip lines        |
| `apps/demo-cli/src/scenarios/basic.ts`         | Create    | Scenario 1 (happy path)                                                 |
| `apps/demo-cli/src/scenarios/budget-fall.ts`   | Create    | Scenario 2 (budget filter; narration distinguishes filter vs fall)      |
| `apps/demo-cli/src/scenarios/capability.ts`    | Create    | Scenario 3 (force-isolate to local; NoTierAvailableError)               |
| `apps/demo-cli/src/scenarios/provider-down.ts` | Create    | Scenario 4 (monkey-patch provider, observe fall)                        |
| `apps/demo-cli/README.md`                      | Modify    | Add sample output after `docker compose up`                             |

No tests. No changeset (apps are not published).

---

## Constraints recap

- No `any` outside test files. No `// eslint-disable*`. No `// @ts-*`.
- `apps/demo-cli/**/*.ts` already has a `no-console: off` override in root eslint.config.mjs (added in scaffolding). The demo's purpose is to print.
- Sign every commit (`git commit -s`). Never `--no-verify`.
- `pnpm run check` must end fully green (lint + typecheck + test + build).
- The demo container must exit 0 when all four scenarios produce expected outcomes (S3's `NoTierAvailableError` is an expected outcome, not failure).

---

## Task 1 — Build the support files (banner + adapter selection)

### Task 1.1: Create `apps/demo-cli/src/banner.ts`

**Files:**

- Create: `apps/demo-cli/src/banner.ts`

- [ ] **Step 1: Write the file**

```ts
import type { FallDiagnostic, LLMResponse } from '@tierfall/core';
import { formatFallChain } from '@tierfall/core';

const SEPARATOR = '='.repeat(60);

export function printTopBanner(adapterStatus: AdapterStatus[]): void {
  console.log(SEPARATOR);
  console.log('TierFall v0.1 — Fall-never-climb demo');
  console.log(SEPARATOR);
  console.log('');
  console.log('Detected adapters:');
  for (const row of adapterStatus) {
    const padName = row.tier.padEnd(15);
    const padImpl = (row.impl ?? 'skipped').padEnd(26);
    console.log(`  ${padName}: ${padImpl}${row.note}`);
  }
  console.log('');
}

export function printScenarioHeader(
  num: number,
  name: string,
  setup: string,
  expected: string,
): void {
  console.log(SEPARATOR);
  console.log(`Scenario ${String(num)}: ${name}`);
  console.log(SEPARATOR);
  console.log(`Setup:    ${setup}`);
  console.log(`Expected: ${expected}`);
  console.log('');
}

export function printSuccess(response: LLMResponse, note?: string): void {
  const fallChain =
    response.fallChain.length === 0
      ? (note ?? '(empty)')
      : `\n${formatFallChain(response.fallChain)}`;
  console.log(
    `✓ tier=${response.tier}  text="${truncate(response.text, 80)}"  fallChain=${fallChain}`,
  );
  console.log('');
}

export function printExpectedThrow(fallChain: readonly FallDiagnostic[]): void {
  console.log(`✓ threw NoTierAvailableError as expected`);
  console.log(`Fall chain:`);
  console.log(formatFallChain(fallChain));
  console.log('');
}

export function printFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.log(`✗ FAILED: ${message}`);
  console.log('');
}

export function printRunSummary(passed: number, total: number): void {
  console.log(SEPARATOR);
  console.log(`Demo complete: ${String(passed)}/${String(total)} scenarios passed`);
  console.log(SEPARATOR);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export interface AdapterStatus {
  readonly tier: string;
  readonly impl: string | undefined;
  readonly note: string;
}
```

### Task 1.2: Create `apps/demo-cli/src/build-adapters.ts`

**Files:**

- Create: `apps/demo-cli/src/build-adapters.ts`

- [ ] **Step 1: Write the file**

```ts
import type { Adapter } from '@tierfall/core';
import { AnthropicAdapter } from '@tierfall/adapter-anthropic';
import { OllamaAdapter } from '@tierfall/adapter-ollama';
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';
import type { AdapterStatus } from './banner.js';

export interface AvailableAdapters {
  readonly premium: Adapter | undefined;
  readonly cheap: Adapter | undefined;
  readonly local: Adapter;
}

export interface BuildResult {
  readonly adapters: AvailableAdapters;
  readonly status: readonly AdapterStatus[];
}

/**
 * Construct the demo's adapter set from env vars.
 *
 * Precedence: if both ANTHROPIC_API_KEY and OPENAI_API_KEY are set,
 * Anthropic wins as premium. Document this in the demo narration.
 */
export function buildAdapters(env: NodeJS.ProcessEnv): BuildResult {
  const status: AdapterStatus[] = [];
  let premium: Adapter | undefined;

  const anthropicKey = env.ANTHROPIC_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  if (anthropicKey !== undefined && anthropicKey !== '') {
    premium = new AnthropicAdapter({ apiKey: anthropicKey, model: 'claude-sonnet-4-7' });
    status.push({
      tier: 'premium-cloud',
      impl: 'anthropic',
      note: '(ANTHROPIC_API_KEY set)',
    });
    if (openaiKey !== undefined && openaiKey !== '') {
      status.push({
        tier: 'premium-cloud',
        impl: undefined,
        note: '— OpenAI ignored: Anthropic takes precedence when both keys set',
      });
    }
  } else if (openaiKey !== undefined && openaiKey !== '') {
    premium = new OpenAICompatibleAdapter(presets.openai({ apiKey: openaiKey }));
    status.push({
      tier: 'premium-cloud',
      impl: 'openai',
      note: '(OPENAI_API_KEY set)',
    });
  } else {
    status.push({
      tier: 'premium-cloud',
      impl: undefined,
      note: '— ANTHROPIC_API_KEY / OPENAI_API_KEY not set',
    });
    console.log('[tierfall] anthropic adapter skipped — ANTHROPIC_API_KEY not set');
    console.log('[tierfall] openai adapter skipped — OPENAI_API_KEY not set');
  }

  let cheap: Adapter | undefined;
  const deepseekKey = env.DEEPSEEK_API_KEY;
  if (deepseekKey !== undefined && deepseekKey !== '') {
    cheap = new OpenAICompatibleAdapter(presets.deepseek({ apiKey: deepseekKey }));
    status.push({
      tier: 'cheap-cloud',
      impl: 'deepseek',
      note: '(DEEPSEEK_API_KEY set)',
    });
  } else {
    status.push({
      tier: 'cheap-cloud',
      impl: undefined,
      note: '— DEEPSEEK_API_KEY not set',
    });
    console.log('[tierfall] deepseek adapter skipped — DEEPSEEK_API_KEY not set');
  }

  const ollamaBaseUrl = env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const local = new OllamaAdapter({ baseUrl: ollamaBaseUrl, model: 'llama3.2:3b' });
  status.push({
    tier: 'on-device',
    impl: 'ollama',
    note: `(${ollamaBaseUrl})`,
  });

  return { adapters: { premium, cheap, local }, status };
}

/** Helper to collect available adapters in tier order (premium → cheap → local). */
export function tierOrderedChain(adapters: AvailableAdapters): readonly Adapter[] {
  const chain: Adapter[] = [];
  if (adapters.premium) chain.push(adapters.premium);
  if (adapters.cheap) chain.push(adapters.cheap);
  chain.push(adapters.local);
  return chain;
}
```

- [ ] **Step 2: Lint + typecheck (this is dead code right now, just confirming it compiles)**

```bash
pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-anthropic,adapter-openai-compatible
pnpm exec eslint --max-warnings=0 apps/demo-cli/src
pnpm --filter @tierfall-app/demo-cli typecheck
```

All: exit 0.

---

## Task 2 — Write the four scenarios

### Task 2.1: Create `apps/demo-cli/src/scenarios/basic.ts`

**Files:**

- Create: `apps/demo-cli/src/scenarios/basic.ts`

- [ ] **Step 1: Write the file**

```ts
import { Router, DefaultPolicy, type LLMRequest } from '@tierfall/core';
import { tierOrderedChain, type AvailableAdapters } from '../build-adapters.js';
import { printScenarioHeader, printSuccess, printFailure } from '../banner.js';

/**
 * Scenario 1: basic chat (happy path).
 *
 * Sends a plain request through whatever adapters are available. The policy
 * orders them by tier; the router lands on the highest-priority one.
 */
export async function runBasicScenario(adapters: AvailableAdapters): Promise<boolean> {
  printScenarioHeader(
    1,
    'Basic chat (happy path)',
    'all available adapters in the chain',
    'first available tier serves; fallChain empty',
  );

  const chain = tierOrderedChain(adapters);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
  };
  const ordered = new DefaultPolicy().evaluate(request, chain);
  if (ordered.length === 0) {
    printFailure(new Error('no adapters available — at least Ollama should be present'));
    return false;
  }
  const router = new Router(ordered);

  try {
    const response = await router.complete(request);
    printSuccess(response);
    return response.fallChain.length === 0;
  } catch (err) {
    printFailure(err);
    return false;
  }
}
```

### Task 2.2: Create `apps/demo-cli/src/scenarios/budget-fall.ts`

**Files:**

- Create: `apps/demo-cli/src/scenarios/budget-fall.ts`

- [ ] **Step 1: Write the file**

```ts
import { Router, DefaultPolicy, type LLMRequest } from '@tierfall/core';
import { tierOrderedChain, type AvailableAdapters } from '../build-adapters.js';
import { printScenarioHeader, printSuccess, printFailure } from '../banner.js';

/**
 * Scenario 2: budget filter (NOT a fall — teaching moment).
 *
 * With maxCostUSD=0.0001, the policy filters premium and cheap out at
 * pre-flight (both cost more than that per 500+500 token estimate). The
 * router never sees them — fallChain is empty even though they were excluded.
 *
 * This is a *filter*, not a *fall*: the policy filtered them silently
 * before the router got a chance to try them. A fall is something the
 * router records when an adapter throws.
 */
export async function runBudgetFallScenario(adapters: AvailableAdapters): Promise<boolean> {
  printScenarioHeader(
    2,
    'Budget filter (silent — not a fall)',
    'all available adapters; request maxCostUSD=$0.0001',
    'policy filters premium and cheap; local serves; fallChain empty',
  );

  const chain = tierOrderedChain(adapters);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
    maxCostUSD: 0.0001,
  };
  const ordered = new DefaultPolicy().evaluate(request, chain);
  console.log(
    `(policy filtered to ${String(ordered.length)} of ${String(chain.length)} adapter${chain.length === 1 ? '' : 's'}; ` +
      `survivor${ordered.length === 1 ? '' : 's'}: ${ordered.map((a) => a.name).join(', ') || '(none)'})`,
  );
  console.log('');
  if (ordered.length === 0) {
    printFailure(new Error('no survivors — at least Ollama (free) should pass the cost filter'));
    return false;
  }
  const router = new Router(ordered);

  try {
    const response = await router.complete(request);
    printSuccess(response, '(empty — filter pre-empted; not a fall)');
    return response.fallChain.length === 0;
  } catch (err) {
    printFailure(err);
    return false;
  }
}
```

### Task 2.3: Create `apps/demo-cli/src/scenarios/capability.ts`

**Files:**

- Create: `apps/demo-cli/src/scenarios/capability.ts`

- [ ] **Step 1: Write the file**

```ts
import { Router, NoTierAvailableError, type LLMRequest } from '@tierfall/core';
import { type AvailableAdapters } from '../build-adapters.js';
import { printScenarioHeader, printExpectedThrow, printFailure } from '../banner.js';

/**
 * Scenario 3: capability mismatch (force-isolate to local).
 *
 * To hit NoTierAvailableError (the AC), we construct Router with only
 * the local adapter — bypassing the policy. If we used the policy, it
 * would filter Ollama out (capability `supportsTools: false`), return
 * `[]`, and `new Router([])` would throw the wrong error type.
 *
 * Going adapter-direct lets the request reach the adapter, where Ollama's
 * pre-HTTP check throws CapabilityMismatchError. The router catches it and
 * builds the NoTierAvailableError. fallChain has one entry with
 * reason: 'capability'.
 */
export async function runCapabilityScenario(adapters: AvailableAdapters): Promise<boolean> {
  printScenarioHeader(
    3,
    'Capability mismatch (NoTierAvailableError expected)',
    'force-isolated chain: [local only]; request requires.tools=true',
    "ollama rejects pre-HTTP; router throws NoTierAvailableError with reason='capability'",
  );

  const router = new Router([adapters.local]);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
    requires: { tools: true },
  };

  try {
    const response = await router.complete(request);
    printFailure(new Error(`expected throw, got response: tier=${response.tier}`));
    return false;
  } catch (err) {
    if (err instanceof NoTierAvailableError) {
      printExpectedThrow(err.fallChain);
      return err.fallChain.length === 1 && err.fallChain[0]?.reason === 'capability';
    }
    printFailure(err);
    return false;
  }
}
```

### Task 2.4: Create `apps/demo-cli/src/scenarios/provider-down.ts`

**Files:**

- Create: `apps/demo-cli/src/scenarios/provider-down.ts`

- [ ] **Step 1: Write the file**

```ts
import {
  ProviderUnavailableError,
  Router,
  NoTierAvailableError,
  type Adapter,
  type LLMRequest,
} from '@tierfall/core';
import { tierOrderedChain, type AvailableAdapters } from '../build-adapters.js';
import { printScenarioHeader, printSuccess, printExpectedThrow, printFailure } from '../banner.js';

/**
 * Wrap an adapter so its `complete` always rejects with ProviderUnavailableError.
 * Lets the demo simulate the highest-priority provider being offline.
 */
function wrapWithProviderDown(adapter: Adapter): Adapter {
  return {
    name: adapter.name,
    tier: adapter.tier,
    capability: adapter.capability,
    complete: () =>
      Promise.reject(new ProviderUnavailableError(`${adapter.name} simulated as offline`)),
  };
}

/**
 * Scenario 4: provider down (router falls past).
 *
 * Wraps the highest-priority adapter to throw ProviderUnavailableError on
 * every request. Router catches, records a FallDiagnostic, advances to the
 * next adapter, which serves.
 *
 * Degenerate case: if only local is available, wrap local — the result is
 * NoTierAvailableError with a 1-deep chain. Still demonstrates the fall.
 */
export async function runProviderDownScenario(adapters: AvailableAdapters): Promise<boolean> {
  const baseChain = tierOrderedChain(adapters);
  if (baseChain.length === 0) {
    printScenarioHeader(4, 'Provider down', 'no adapters available', 'cannot run');
    printFailure(new Error('no adapters available'));
    return false;
  }

  const firstAdapter = baseChain[0];
  if (firstAdapter === undefined) {
    printFailure(new Error('unreachable: baseChain.length > 0 but [0] is undefined'));
    return false;
  }
  const patchedFirst = wrapWithProviderDown(firstAdapter);
  const patchedChain = [patchedFirst, ...baseChain.slice(1)];

  const isDegenerate = baseChain.length === 1;
  printScenarioHeader(
    4,
    'Provider down (router falls past)',
    `chain: [${baseChain.map((a) => a.name).join(', ')}]; wrapping ${firstAdapter.name} to throw ProviderUnavailable`,
    isDegenerate
      ? "single-adapter degenerate case → NoTierAvailableError with reason='provider-unavailable'"
      : "router falls past wrapped adapter; fallChain[0].reason='provider-unavailable'",
  );

  const router = new Router(patchedChain);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
  };

  try {
    const response = await router.complete(request);
    printSuccess(response);
    return (
      response.fallChain.length >= 1 && response.fallChain[0]?.reason === 'provider-unavailable'
    );
  } catch (err) {
    if (err instanceof NoTierAvailableError && isDegenerate) {
      printExpectedThrow(err.fallChain);
      return err.fallChain.length === 1 && err.fallChain[0]?.reason === 'provider-unavailable';
    }
    printFailure(err);
    return false;
  }
}
```

### Task 2.5: Rewrite `apps/demo-cli/src/main.ts`

**Files:**

- Modify: `apps/demo-cli/src/main.ts` (replace stub)

- [ ] **Step 1: Replace the file contents**

```ts
import { buildAdapters } from './build-adapters.js';
import { printTopBanner, printRunSummary } from './banner.js';
import { runBasicScenario } from './scenarios/basic.js';
import { runBudgetFallScenario } from './scenarios/budget-fall.js';
import { runCapabilityScenario } from './scenarios/capability.js';
import { runProviderDownScenario } from './scenarios/provider-down.js';

async function main(): Promise<void> {
  const { adapters, status } = buildAdapters(process.env);
  printTopBanner(status);

  const results: boolean[] = [];
  results.push(await runBasicScenario(adapters));
  results.push(await runBudgetFallScenario(adapters));
  results.push(await runCapabilityScenario(adapters));
  results.push(await runProviderDownScenario(adapters));

  const passed = results.filter((r) => r).length;
  printRunSummary(passed, results.length);

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

await main();
```

### Task 2.6: Build, lint, typecheck

- [ ] **Step 1: Build all packages so the demo's imports resolve**

```bash
pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-anthropic,adapter-openai-compatible
```

Expected: exit 0.

- [ ] **Step 2: Build the demo**

```bash
pnpm --filter @tierfall-app/demo-cli build
```

Expected: exit 0; emits `apps/demo-cli/dist/main.cjs`.

- [ ] **Step 3: Lint + typecheck the demo**

```bash
pnpm exec eslint --max-warnings=0 apps/demo-cli/src
pnpm --filter @tierfall-app/demo-cli typecheck
```

Both: exit 0.

If lint complains about `[0]?.reason` access patterns (non-null-assertion-style under strictTypeChecked), the `noUncheckedIndexedAccess: true` returns `T | undefined` — already handled with `?.` and explicit guards. If lint still complains, use a runtime guard (`const first = chain[0]; if (!first) throw ...`).

If typecheck complains about `process.env.X` reads, our tsconfig already pulls in `@types/node` per `types: ["jest", "node"]` in the package tsconfig — this should resolve cleanly. If not, the package tsconfig may need `@types/node` added to its types array.

### Task 2.7: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add apps/demo-cli/src/main.ts \
        apps/demo-cli/src/banner.ts \
        apps/demo-cli/src/build-adapters.ts \
        apps/demo-cli/src/scenarios
git commit -s -m "feat(demo): implement four scenarios (basic, budget, capability, provider-down)

Six files in apps/demo-cli/src/:
- main.ts orchestrates the run (banner + 4 scenarios + summary + exit code)
- banner.ts holds printing helpers (uses formatFallChain from #4)
- build-adapters.ts does env-driven selection with explicit skip log lines
- scenarios/{basic,budget-fall,capability,provider-down}.ts — one file each

Scenario 2 narrates filter-vs-fall distinction (policy filtered != router
fell). Scenario 3 force-isolates Router([local]) to bypass policy and
get NoTierAvailableError from the adapter-level CapabilityMismatchError.
Scenario 4 wraps the highest-priority adapter; handles single-adapter
degenerate case cleanly.

Demo exits 0 when all 4 scenarios produce expected outcomes (S3's
NoTierAvailableError is expected).

Anthropic takes precedence over OpenAI when both keys are present.
Documented; can be made overridable via env in a future PR.

Closes #9."
```

---

## Task 3 — Update README with sample output

### Task 3.1: Rewrite `apps/demo-cli/README.md`

**Files:**

- Modify: `apps/demo-cli/README.md`

- [ ] **Step 1: Replace the file contents**

````markdown
# @tierfall-app/demo-cli

Containerized end-to-end demo of TierFall's fall-never-climb routing.

## Run via Docker Compose (recommended)

```bash
docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo
```
````

First run pulls `llama3.2:3b` (~2GB) and may take 10–20 minutes. Subsequent runs reuse the cached model volume and complete in ~30 seconds.

Optional environment variables (pass via `.env` at repo root):

| Env                 | Effect                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Enables premium-cloud tier via `@tierfall/adapter-anthropic` (Claude Sonnet 4.7). Takes precedence over `OPENAI_API_KEY`. |
| `OPENAI_API_KEY`    | Enables premium-cloud tier via the `openai` preset, but only if `ANTHROPIC_API_KEY` is unset.                             |
| `DEEPSEEK_API_KEY`  | Enables cheap-cloud tier via the `deepseek` preset.                                                                       |
| `OLLAMA_BASE_URL`   | Override Ollama URL (default: `http://localhost:11434`; inside Compose: `http://ollama:11434`).                           |

Missing keys log a skip line; the demo runs with whatever's available. Ollama is always-on (Compose provides it).

## What the four scenarios show

1. **Basic chat** — request flows to the highest-priority tier and returns. `fallChain` is empty.
2. **Budget filter (silent)** — request includes `maxCostUSD: 0.0001`. The _policy_ filters premium and cheap out at pre-flight; the _router_ never sees them. `fallChain` is empty even though tiers were excluded — because a filter is silent, not a fall.
3. **Capability mismatch** — request requires tool calling (`requires.tools: true`), but the demo force-constructs Router with only the local adapter. Ollama rejects pre-HTTP with `CapabilityMismatchError`; router throws `NoTierAvailableError` with a 1-deep fallChain.
4. **Provider down** — the highest-priority adapter is wrapped to throw `ProviderUnavailableError`. Router falls past it transparently; the next tier serves. `fallChain[0].reason === 'provider-unavailable'`.

## Run locally without Docker

If you already have Ollama running locally with `llama3.2:3b` pulled:

```bash
pnpm install
pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-anthropic,adapter-openai-compatible,demo-cli
node apps/demo-cli/dist/main.cjs
```

Set env vars via your shell (e.g., `ANTHROPIC_API_KEY=sk-ant-... node apps/demo-cli/dist/main.cjs`).

````

- [ ] **Step 2: Verify prettier**

```bash
pnpm exec prettier --check apps/demo-cli/README.md
````

Expected: exit 0. If it complains, `pnpm exec prettier --write` first.

### Task 3.2: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add apps/demo-cli/README.md
git commit -s -m "docs(demo): README with run instructions + scenario descriptions

Documents the four scenarios in user-facing language, the env vars
the demo recognizes (with the anthropic > openai precedence noted),
and the docker compose entry point.

Refs #9."
```

---

## Final verification before opening the PR

- [ ] **Step 1: Branch state**

```bash
git log --oneline develop..HEAD
```

Expected: 3 commits (spec + 2 implementation).

- [ ] **Step 2: Full local check**

```bash
pnpm run check
```

Expected:

- lint: pass
- typecheck: pass
- test: pass (all four packages green; no new tests in this PR — demo isn't published)
- build: pass (demo-cli's dist now contains the 4 scenario imports)

- [ ] **Step 3: Optional smoke against a local Ollama (if running)**

Set `OLLAMA_BASE_URL=http://localhost:11434` (if your local Ollama is reachable) and:

```bash
pnpm --filter @tierfall-app/demo-cli build
node apps/demo-cli/dist/main.cjs
```

Expected: prints the banner, then four scenarios. Each ends with ✓. Exit 0.

If Ollama isn't running locally, skip this step — CI's Docker Compose stack provides Ollama for the real smoke.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/demo-scenarios
```

- [ ] **Step 5: Open PR**

````bash
gh pr create \
  --base develop \
  --head feat/demo-scenarios \
  --title "feat(demo): implement four scenarios end-to-end" \
  --body-file - <<'BODY'
## Summary

Implements the four demo scenarios per `docs/superpowers/specs/2026-05-20-demo-scenarios-design.md`. Closes #9.

This is the v0.1 showcase work — what people clone the repo to see.

## Acceptance criteria

- [x] Scenario 1 (basic chat) prints text, tier, empty fallChain
- [x] Scenario 2 (budget) — policy filters premium/cheap; local serves
- [x] Scenario 3 (capability mismatch) — `NoTierAvailableError` thrown; diagnostic chain printed
- [x] Scenario 4 (provider down) — adapter wrapped; router falls past
- [x] Each scenario prints expected outcome, what happened, full fall chain
- [x] Missing-API-key adapters skipped with `[tierfall] X adapter skipped — Y_API_KEY not set`
- [x] No changeset (apps not published)

## Design choices to highlight

- **Scenario 2 narrates filter-vs-fall distinction.** Policy filters are silent; router falls are recorded. The demo labels them correctly, turning the budget scenario into a teaching moment about the policy/router boundary.
- **Scenario 3 bypasses policy.** If we used policy with `requires.tools: true`, it returns `[]` → `new Router([])` throws "Router requires at least one adapter" (wrong error type). Force-constructing `new Router([local])` lets the request reach the adapter, where the pre-HTTP capability check throws `CapabilityMismatchError` → Router → `NoTierAvailableError`. Documented as a code comment.
- **Anthropic > OpenAI precedence.** When both keys are set, Anthropic takes premium. Documented in `build-adapters.ts` and README.

## How to validate locally

```bash
pnpm install
pnpm run check                        # all green
# Either via Docker Compose:
docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo
# Or against a local Ollama:
pnpm exec nx run-many --target=build --projects=core,adapter-ollama,adapter-anthropic,adapter-openai-compatible,demo-cli
node apps/demo-cli/dist/main.cjs
````

The Compose run on a clean machine takes 10-20 min the first time (Ollama pulls `llama3.2:3b`). Cached after.
BODY

````

- [ ] **Step 6: Watch CI**

Use Monitor on `gh pr checks <PR#>` until all checks complete. Expect all 13 checks green.

- [ ] **Step 7: Merge**

```bash
gh pr merge <PR#> --merge --delete-branch --admin
````

- [ ] **Step 8: Move board card; pull develop**

```bash
source "$CLAUDE_JOB_DIR/project-ids.sh"
ITEM_ID=$(gh api graphql -f query='{ organization(login: "tierfall") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }' --jq '.data.organization.projectV2.items.nodes[] | select(.content.number==9) | .id')
gh project item-edit --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_DONE_ID" --project-id "$PROJECT_ID" > /dev/null

git checkout develop
git pull --ff-only origin develop
git log --oneline -5
```
