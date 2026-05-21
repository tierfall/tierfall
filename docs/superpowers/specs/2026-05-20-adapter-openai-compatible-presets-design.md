# OpenAI-Compatible Presets — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#7 — feat(adapter-openai-compatible): ship /presets sub-export](https://github.com/tierfall/tierfall/issues/7)
**Scope:** Implement the five preset factories stubbed in `packages/adapter-openai-compatible/src/presets.ts`. Replace 9 red TDD tests in `presets.test.ts` with real coverage. Remove `continue-on-error: true` from CI's `test-rest` job (the final red-TDD masking). Update branch protection to add `test-rest` as a required check.

---

## 1. Goal

Make the `/presets` sub-export real. Five blessed configurations for the OpenAI-compatible adapter:

```ts
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';

const adapter = new OpenAICompatibleAdapter(
  presets.deepseek({
    apiKey: process.env.DEEPSEEK_API_KEY!,
  }),
);
```

Each preset bundles a `baseUrl`, default `model`, default `tier`, and a `capability` block with realistic per-provider pricing. The user supplies `apiKey` (and any overrides) at call time.

This PR also closes the CI loop: `presets.test.ts` was the last red TDD test in `test-rest`. After this lands, `test-rest` becomes a real required check.

## 2. Preset values

Each preset has been chosen to match the provider's documented current API surface as of the implementation date. **At execute time, spot-check the live pricing pages and adjust if drift exceeds ~20%.**

| Preset       | `baseUrl`                        | Default `model`           | `tier`          | Context (tokens) | $/MTok input | $/MTok output | Pricing source                                      |
| ------------ | -------------------------------- | ------------------------- | --------------- | ---------------- | ------------ | ------------- | --------------------------------------------------- |
| `groq`       | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | `cheap-cloud`   | 128_000          | 0.59         | 0.79          | `console.groq.com/docs/models` + `groq.com/pricing` |
| `deepseek`   | `https://api.deepseek.com/v1`    | `deepseek-chat`           | `cheap-cloud`   | 64_000           | 0.27         | 1.10          | `api-docs.deepseek.com/quick_start/pricing`         |
| `openai`     | `https://api.openai.com/v1`      | `gpt-5-mini`              | `premium-cloud` | 200_000          | 0.15         | 0.60          | `openai.com/api/pricing`                            |
| `cerebras`   | `https://api.cerebras.ai/v1`     | `llama3.3-70b`            | `cheap-cloud`   | 8_192            | 0.85         | 1.20          | `inference.cerebras.ai/pricing`                     |
| `openrouter` | `https://openrouter.ai/api/v1`   | `openai/gpt-5-mini`       | `cheap-cloud`   | 128_000          | 0.15         | 0.60          | `openrouter.ai/docs/models` (pass-through)          |

**Capability `supportsTools/Streaming/StructuredOutput` are all `false`** — matches the adapter's v0.1 conservatism. User overrides if they know their provider supports a feature AND understand the adapter limitation.

**TSDoc on each preset cites the pricing source URL** so future contributors know where to verify.

## 3. Type shape

```ts
import type { AdapterCapability } from '@tierfall/core';
import type { OpenAICompatibleAdapterConfig } from '../adapter.js';

export type PresetFactory = (
  overrides?: Partial<OpenAICompatibleAdapterConfig>,
) => OpenAICompatibleAdapterConfig;

export interface OpenAICompatiblePresets {
  readonly groq: PresetFactory;
  readonly deepseek: PresetFactory;
  readonly openai: PresetFactory;
  readonly cerebras: PresetFactory;
  readonly openrouter: PresetFactory;
}

export const presets: OpenAICompatiblePresets = {
  /* ... five factory functions ... */
};
```

**Explicit interface, not `Record<string, PresetFactory>`.** Under `noUncheckedIndexedAccess: true`, `Record` returns `T | undefined`, which would require `!` non-null assertions on every access (banned by lint). Explicit interface gives direct typed access: `presets.groq()` returns `OpenAICompatibleAdapterConfig` cleanly.

## 4. Override merging

```ts
function mergePreset(
  base: OpenAICompatibleAdapterConfig,
  overrides?: Partial<OpenAICompatibleAdapterConfig>,
): OpenAICompatibleAdapterConfig {
  return {
    ...base,
    ...overrides,
    capability: {
      ...(base.capability ?? {}),
      ...(overrides?.capability ?? {}),
    },
  };
}
```

**Override wins** at top-level AND inside `capability` (deep-merge one level). Common pattern:

```ts
const adapter = new OpenAICompatibleAdapter(
  presets.openai({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-5-pro', // overrides default 'gpt-5-mini'
    capability: { contextWindowTokens: 200_000 }, // overrides only context, other capability fields preserved
  }),
);
```

Without deep-merge on `capability`, the user's `{ contextWindowTokens: 200_000 }` would clobber the preset's pricing values. The deep-merge keeps preset defaults for unspecified fields.

## 5. Tests — 9 in `presets.test.ts`

Rewrites the existing 2 red tests + 7 new ones:

| #   | Name                                                                                                                        | Lock-in                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | exposes the five v0.1 presets                                                                                               | API surface (keys exist)                                                                             |
| 2   | `groq()` produces valid config                                                                                              | preset-shape happy path                                                                              |
| 3   | `deepseek()` baseUrl + model + tier                                                                                         | per-preset value lock                                                                                |
| 4   | `openai()` produces config with `tier: 'premium-cloud'`                                                                     | unique tier among presets                                                                            |
| 5   | `cerebras()` baseUrl + model + tier                                                                                         | per-preset value lock                                                                                |
| 6   | `openrouter()` baseUrl uses `openrouter.ai`; model uses `/`-separated routing format                                        | unique URL + model shape                                                                             |
| 7   | Override at top level: `presets.groq({ model: 'custom' }).model === 'custom'`                                               | top-level merge                                                                                      |
| 8   | Override deep-merge: `presets.groq({ capability: { contextWindowTokens: 999 } })` keeps other capability fields from preset | deep-merge correctness                                                                               |
| 9   | All presets have non-zero pricing                                                                                           | sanity check that no preset accidentally has `costPerMillion*: 0` (which would defeat budget policy) |

## 6. CI cleanup (the milestone)

`presets.test.ts` was the last red TDD test in `test-rest`. After this PR:

- **Remove `continue-on-error: true`** from `.github/workflows/ci.yml`'s `test-rest` job
- **Remove the `TODO(#8)` comment** in `ci.yml` — the chain it was tracking (#5/#6/#7/#8) is fully closed
- **Update branch protection** on `develop` AND `main` to add `test-rest` to `required_status_checks.contexts`:
  ```
  Before: lint, typecheck, test-core, build, publint, attw, knip, CodeQL
  After:  lint, typecheck, test-core, test-rest, build, publint, attw, knip, CodeQL
  ```

After this PR, breaking any adapter is a hard CI failure. No more red-TDD masking.

## 7. Files changed

| File                                                      | Operation                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/adapter-openai-compatible/src/presets.ts`       | Rewrite (5 real preset factories + mergePreset + types)              |
| `packages/adapter-openai-compatible/src/presets/index.ts` | Unchanged (still re-exports `{ presets, PresetFactory }`)            |
| `packages/adapter-openai-compatible/test/presets.test.ts` | Rewrite (9 tests)                                                    |
| `packages/adapter-openai-compatible/CLAUDE.md`            | Append preset documentation + pricing-citation note                  |
| `.github/workflows/ci.yml`                                | Drop `continue-on-error` from `test-rest`; remove `TODO(#8)` comment |
| `.changeset/feat-adapter-openai-compatible-presets.md`    | New (`@tierfall/core` minor)                                         |

Branch protection update is an out-of-band `gh api` PUT (same pattern as #2 used to swap `test` → `test-core`). Documented in the PR body for the maintainer to run before merge.

## 8. Commit plan

**3 commits:**

1. **`feat(adapter-openai-compatible): implement 5 presets + 9 tests`** — `src/presets.ts` + `test/presets.test.ts`.
2. **`ci: drop continue-on-error from test-rest (presets close the chain)`** — `.github/workflows/ci.yml`. The PR description triggers the branch-protection update separately.
3. **`docs(adapter-openai-compatible): CLAUDE.md preset documentation + changeset`** — CLAUDE.md note about preset usage + `.changeset/` file.

## 9. Acceptance criteria mapping

| AC from issue #7                                                                                                     | How met                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Each preset returns valid `OpenAICompatibleAdapterConfig` with vendor-correct `baseUrl` and sensible default `model` | §2 values; tests #2–#6 verify per-preset config                                                                                 |
| Each preset accepts `overrides` and merges them (override wins)                                                      | §4 `mergePreset`; tests #7 + #8                                                                                                 |
| Each preset sets sensible `capability` defaults (cost figures from vendor pricing pages — cite source in TSDoc)      | §2 pricing table + TSDoc source citations; test #9 sanity-checks non-zero                                                       |
| Existing red test in `presets.test.ts` passes; add one test per preset                                               | Tests #1 + #2 are the rewritten existing ones; tests #3–#6 add per-preset coverage (one each); plus #7–#9 add override + sanity |
| `@tierfall/adapter-openai-compatible/presets` resolves correctly in ESM and CJS (verified by `attw`)                 | Sub-export already wired in `package.json` from #6's PR; `attw` runs in CI and validates resolution                             |
| Changeset added                                                                                                      | Commit 3 — `@tierfall/core` minor (linked-mode)                                                                                 |

## 10. Out of scope

- **Additional presets** (Together AI, Fireworks, Mistral, etc.) — future work; the five chosen are the spec's named set
- **Model autodetection** (querying the provider's `/v1/models` endpoint to populate defaults) — overkill for v0.1
- **Streaming-aware presets** — capability flags stay `false` until v0.4's wire-level implementation
- **Cost auto-refresh** from live pricing pages — manual TSDoc update on drift; acceptable for v0.1 cadence

## 11. Risks

- **Pricing drift.** Numbers in §2 reflect best-effort from cutoff knowledge. Will spot-check at execute time and adjust. After this PR merges, pricing drift becomes a documentation-debt issue; a future preset-refresh PR can update values when a vendor changes their rate card.
- **Model deprecation.** `gpt-5-mini`, `deepseek-chat`, etc. are current as of cutoff but providers retire models. Users get clear errors (404 → ProviderUnavailableError) and the preset is updated in a follow-up PR.
- **`test-rest` going required may surface latent test flakiness.** All current adapter tests are fully deterministic (mocked fetch); no real-world flake risk. If this changes (e.g., adding env-gated integration paths), they'd go in separate jobs.
- **Branch-protection update is manual.** Documented in the PR body; maintainer runs the `gh api` PUT before merge. Same pattern as #2's `test` → `test-core` swap.

## 12. References

- OpenAI-compatible adapter spec (#6, just landed): `docs/superpowers/specs/2026-05-20-adapter-openai-compatible-implementation-design.md`
- Each preset's pricing source URL (cited in TSDoc within `src/presets.ts`)
