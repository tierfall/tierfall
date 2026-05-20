# packages/core — Claude context

`@tierfall/core` exports the **Adapter interface, Router, Policy types, shared types**,
and the **error taxonomy**. It contains **no adapter implementations** and **no vendor
SDK dependencies**. Anything that imports `@tierfall/core` MUST be safe to install
without dragging in OpenAI / Anthropic / Ollama SDKs.

## Key contracts

- `Adapter` — what every adapter package implements. See `src/adapter.ts`.
- `Router` — fall-never-climb state machine. Skeleton at scaffold; real logic = issue #2.
- `Policy` — declarative evaluator. Skeleton at scaffold; real logic = issue #3.

## Invariants

- Tier order is fixed: `premium-cloud → cheap-cloud → self-hosted-edge → on-device`.
- A "fall" moves toward higher tier index (cheaper). Climbing requires explicit policy.
- Adapters throw typed errors (`BudgetExceededError`, `CapabilityMismatchError`,
  `ProviderUnavailableError`); the Router catches and translates these into
  `FallDiagnostic` entries on the response's `fallChain`.

## When changing this package

Run `pnpm --filter @tierfall/core test` and verify the existing red TDD tests
in `test/router.test.ts` and `test/policy.test.ts` only flip green via the
issue they're tagged to. Don't make them pass by altering the test.
