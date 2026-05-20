# packages/adapter-ollama — Claude context

`@tierfall/adapter-ollama` is the **on-device** adapter targeting a local Ollama daemon.
It implements the `Adapter` interface from `@tierfall/core` and is the canonical zero-cost
tier for the fall-never-climb router.

## Key contracts

- `OllamaAdapter` implements `Adapter` from `@tierfall/core`.
- `tier = 'on-device'`. Free (cost is `null`); availability depends on the daemon.
- Default `baseUrl` is `http://localhost:11434` (per Ollama's stock config).

## Implementation status

The skeleton throws `not yet implemented — see issue #5`. Real implementation:

- Talks to `POST /api/chat` on the configured base URL.
- Treats network failure / connection refused as `ProviderUnavailableError`.
- No API key, but accepts one in config for parity with cloud adapters (ignored).
- Streaming is supported by Ollama; v0.1 issue #5 implements non-streaming first.

## When changing this package

Run `pnpm --filter @tierfall/adapter-ollama test`. The red TDD test in
`test/adapter.test.ts` must only flip green when issue #5 is closed — don't make
it pass by altering the test.
