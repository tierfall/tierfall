# Demo Scenarios — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#9 — feat(demo): implement four scenarios](https://github.com/tierfall/tierfall/issues/9)
**Scope:** Replace `apps/demo-cli/src/main.ts` stub with a real four-scenario showcase. Six files in `apps/demo-cli/src/`. No tests (apps don't publish; verification is Docker-compose end-to-end run). No changeset.

---

## 1. Goal

After this PR, `docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo` runs four scenarios that visibly demonstrate TierFall's "Fall, never climb" behavior against real LLM adapters. This is the v0.1 showcase — what someone clones the repo to see.

## 2. File structure

```
apps/demo-cli/src/
  main.ts              # entry — env detection banner, then runs the 4 scenarios sequentially
  banner.ts            # shared printing helpers: scenario banner, separator, fall chain rendering
  build-adapters.ts    # env → optional Anthropic/OpenAI-compatible (DeepSeek)/Ollama instances
  scenarios/
    basic.ts           # Scenario 1
    budget-fall.ts     # Scenario 2
    capability.ts      # Scenario 3
    provider-down.ts   # Scenario 4
```

Six files, ~250 lines total. Each scenario is independently readable; `main.ts` is a thin orchestrator.

## 3. Env-driven adapter selection (`build-adapters.ts`)

```ts
import { AnthropicAdapter } from '@tierfall/adapter-anthropic';
import { OllamaAdapter } from '@tierfall/adapter-ollama';
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';
import type { Adapter } from '@tierfall/core';

export interface AvailableAdapters {
  premium?: Adapter; // Anthropic if ANTHROPIC_API_KEY; OpenAI preset if OPENAI_API_KEY
  cheap?: Adapter; // DeepSeek preset if DEEPSEEK_API_KEY
  local: Adapter; // always; default baseUrl 'http://localhost:11434', override via OLLAMA_BASE_URL
}

export function buildAdapters(env: NodeJS.ProcessEnv): AvailableAdapters {
  // ... env detection + adapter construction
  // logs skip lines for missing keys
}
```

**Env handling:**

- `ANTHROPIC_API_KEY` → AnthropicAdapter as premium. Skipped+logged if absent.
- `OPENAI_API_KEY` → OpenAI preset → premium if Anthropic absent, else **skipped+logged** (anthropic takes precedence; document the choice).
- `DEEPSEEK_API_KEY` → DeepSeek preset → cheap. Skipped+logged if absent.
- `OLLAMA_BASE_URL` → defaults to `http://localhost:11434`. Always-on; Compose stack provides reachability at `http://ollama:11434`.

**Skip log line format:**

```
[tierfall] anthropic adapter skipped — ANTHROPIC_API_KEY not set
[tierfall] deepseek adapter skipped — DEEPSEEK_API_KEY not set
```

## 4. The four scenarios

### Scenario 1 — Basic chat (happy path)

- **Chain:** all available adapters (premium → cheap → local)
- **Request:** `{ messages: [{ role: 'user', content: "Reply with exactly 'ok'." }], model: 'auto' }`
- **Flow:** policy returns full chain; router lands on the first available tier; succeeds
- **Output asserts:** prints `tier` landed on, `text` (the response), and confirms `fallChain.length === 0`

If only `local` is available, this still works against Ollama. The output narration says "first available tier" honestly — not "premium".

### Scenario 2 — Budget fall (filter ≠ fall)

- **Chain:** all available adapters
- **Request:** same shape as Scenario 1, plus `maxCostUSD: 0.0001`
- **Flow:** policy filters out premium and cheap (both cost > $0.0001 for 500+500 tokens at preset rates); policy returns `[local]`; local serves
- **Output asserts:** `tier === 'on-device'`, `fallChain === []` (filter happens before router; no FallDiagnostic recorded)
- **Teaching moment in narration:** "Notice the fallChain is empty even though premium and cheap were excluded. The _policy_ filtered them out (capability/budget pre-flight). A _fall_ is something the _router_ records when it tries an adapter and that adapter rejects. Filtering is silent; falling is observed."

### Scenario 3 — Capability mismatch (force-isolate to local)

- **Chain:** **`new Router([localAdapter])` directly — bypass policy.** Force-construct just Ollama regardless of env.
- **Request:** `{ ..., requires: { tools: true } }`
- **Flow:** Router enters Ollama → adapter checks `requires.tools` pre-HTTP → throws `CapabilityMismatchError` → Router catches → `NoTierAvailableError(message, [{ reason: 'capability', adapterName: 'ollama', ... }])`
- **Output asserts:** demo catches `NoTierAvailableError`, prints `err.fallChain` via `formatFallChain` (the helper from #4 — first real-world use)

Why bypass the policy: if we used it, `requires.tools: true` would filter Ollama out (capability `supportsTools: false`), policy returns `[]`, `new Router([])` throws a different error type ("Router requires at least one adapter"). The AC says we should see `NoTierAvailableError` — the way to hit that is to construct Router with a single adapter that will then reject the request at adapter-level.

### Scenario 4 — Provider down

- **Chain:** wrap the highest-priority available adapter in a "throw `ProviderUnavailableError`" proxy; other adapters unchanged
- **Request:** plain (Scenario 1 shape, no maxCost, no requires)
- **Flow:** Router tries adapter[0] → catches → records FallDiagnostic with `reason: 'provider-unavailable'` → tries adapter[1] → succeeds
- **Output asserts:** `fallChain.length === 1`, `fallChain[0].reason === 'provider-unavailable'`, response from the next tier
- **Single-adapter degenerate case** (only `local` available): wrap `local` itself. Result is `NoTierAvailableError` with 1-deep chain. Narration handles both paths.

**The wrap helper** lives in `provider-down.ts`:

```ts
function wrapWithProviderDown(adapter: Adapter): Adapter {
  return {
    name: adapter.name,
    tier: adapter.tier,
    capability: adapter.capability,
    complete: () =>
      Promise.reject(new ProviderUnavailableError(`${adapter.name} is being simulated as offline`)),
  };
}
```

## 5. Output format

**Top-of-run banner:**

```
============================================================
TierFall v0.1 — Fall-never-climb demo
============================================================

Detected adapters:
  premium-cloud  : anthropic                 (ANTHROPIC_API_KEY set)
  cheap-cloud    : skipped                   — DEEPSEEK_API_KEY not set
  on-device      : ollama                    (http://ollama:11434)

```

**Per-scenario banner + result block:**

```
============================================================
Scenario 2: Budget fall
============================================================
Setup:    3 adapters (premium, cheap, local); request has maxCostUSD=$0.0001
Expected: policy filters premium and cheap; local serves; fallChain empty

✓ tier=on-device  text="ok"  fallChain=(empty — filter pre-empted)
```

If a scenario errors out unexpectedly, the demo prints `✗ FAILED: <error>` and exits non-zero. Expected errors (S3's `NoTierAvailableError`) are not treated as failure.

**Final summary:**

```
============================================================
Demo complete: 4 scenarios run
============================================================
```

The demo exits 0 on success (all 4 scenarios produced expected outcomes), non-zero on unexpected failure.

## 6. Docker compose end-to-end

After implementation, run from a clean checkout:

```bash
docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo
```

**First run:** Ollama service container boots (~10 sec); `ollama-init` pulls `llama3.2:3b` (~2GB, 5-15 min depending on network); demo container builds (~1 min); scenarios run (~30 sec — three real LLM calls + one expected throw). **Total ~10-20 min first run.**

**Subsequent runs:** named volume persists the model. Demo run is ~30 sec end-to-end.

The PR description includes a sample of the actual output (captured after running locally).

## 7. Files changed

| File                                           | Operation                                      |
| ---------------------------------------------- | ---------------------------------------------- |
| `apps/demo-cli/src/main.ts`                    | Rewrite (replaces 14-line stub)                |
| `apps/demo-cli/src/banner.ts`                  | Create                                         |
| `apps/demo-cli/src/build-adapters.ts`          | Create                                         |
| `apps/demo-cli/src/scenarios/basic.ts`         | Create                                         |
| `apps/demo-cli/src/scenarios/budget-fall.ts`   | Create                                         |
| `apps/demo-cli/src/scenarios/capability.ts`    | Create                                         |
| `apps/demo-cli/src/scenarios/provider-down.ts` | Create                                         |
| `apps/demo-cli/README.md`                      | Update with `docker compose up` output snippet |

No tests (apps don't publish; verification is the Compose run). No changeset.

## 8. Commit plan

**Two commits:**

1. **`feat(demo): implement four scenarios (basic, budget, capability, provider-down)`** — all 7 source/config files.
2. **`docs(demo): README with sample output`** — update README.md to show actual demo output post-implementation.

## 9. Acceptance criteria mapping

| AC from issue #9                                                                                                                            | How met                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario 1 (basic chat) prints text, tier, empty fallChain                                                                                  | §4 / Scenario 1; output template in §5                                                                                                                                                                  |
| Scenario 2 (budget fall) — premium has artificially low maxCostUSD; router falls to cheap → local; prints fall chain                        | §4 / Scenario 2. **Note: this is technically a filter, not a fall.** The narration distinguishes them. The end-state matches the AC (lands on local) but the mechanism is clearer with the distinction. |
| Scenario 3 (capability mismatch) — only Ollama available; requires.tools: true; router throws NoTierAvailableError; prints diagnostic chain | §4 / Scenario 3; uses `formatFallChain` from #4                                                                                                                                                         |
| Scenario 4 (provider down) — monkey-patches one adapter to throw ProviderUnavailableError; router falls past it                             | §4 / Scenario 4                                                                                                                                                                                         |
| Each scenario prints expected outcome, what happened, full fall chain                                                                       | §5 output format                                                                                                                                                                                        |
| Missing-API-key adapters skipped with `[tierfall] X adapter skipped — Y_API_KEY not set`                                                    | §3 env handling + skip log format                                                                                                                                                                       |
| `docker compose ... up --abort-on-container-exit demo` runs all four scenarios end-to-end against the Compose Ollama                        | §6 end-to-end verification                                                                                                                                                                              |
| No changeset (apps not published)                                                                                                           | §7 + §8                                                                                                                                                                                                 |

## 10. Notable design choices to highlight in the PR

- **S2 distinguishes filter from fall** — the AC's wording implies cheap "falls" to local but mechanically it's a filter (policy never gave it to router). The demo treats this as a teaching opportunity and labels it correctly in the narration.
- **S3 bypasses the policy** — see §4 / Scenario 3 reasoning. Documented in the source as a comment so future readers understand why.
- **OpenAI-API key handled but lower precedence than Anthropic** — when both are set, Anthropic wins as premium. Documented; future PR could introduce a `TIERFALL_PREMIUM_PROVIDER` env override if needed.

## 11. Out of scope

- Replay mode (CLI arg to re-run a specific scenario)
- Streaming demos — v0.4
- Tool-call demos — v0.4
- TUI rendering (ink) — deferred per bootstrap plan
- Demo tests — apps don't publish; verification is Compose end-to-end
