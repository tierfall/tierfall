# TierFall

> Local-first AI routing for TypeScript. **Fall, never climb.**

[![CI](https://github.com/tierfall/tierfall/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/tierfall/tierfall/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![codecov](https://codecov.io/gh/tierfall/tierfall/branch/develop/graph/badge.svg)](https://codecov.io/gh/tierfall/tierfall)

TierFall routes AI calls between four tiers — on-device, self-hosted edge, cheap cloud,
premium cloud — based on declarative policy. On failure, capability mismatch, or budget
breach, the router falls to a **cheaper** tier. Climbing toward premium is explicit,
observable, and never the default.

TierFall is designed to sit **underneath** frameworks like the Vercel AI SDK, not replace them.

## What works today

**v0.1 is released** — all four published packages (`@tierfall/core`, `@tierfall/adapter-ollama`,
`@tierfall/adapter-openai-compatible`, `@tierfall/adapter-anthropic`) ship as v0.1.0 with
working router, declarative policy, three adapters, five blessed OpenAI-compat presets, and
a containerized demo. See the [docs](https://tierfall.github.io/tierfall) for concepts and reference.

## Example

```ts
import { Router } from '@tierfall/core';
import { OllamaAdapter } from '@tierfall/adapter-ollama';
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';
import { AnthropicAdapter } from '@tierfall/adapter-anthropic';

const router = new Router([
  new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-sonnet-4-7' }),
  new OpenAICompatibleAdapter(presets.deepseek({ apiKey: process.env.DEEPSEEK_API_KEY! })),
  new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama3.2:3b' }),
]);

const response = await router.complete({
  messages: [{ role: 'user', content: 'Summarize the four-tier model.' }],
  model: 'auto',
  maxCostUSD: 0.05,
});

console.log(response.text);
console.log('Served by tier:', response.tier);
console.log('Fall chain:', response.fallChain);
```

> Note: this is the **v0.1 scaffold**. The packages above export typed skeletons that
> throw `not implemented` on real calls. The router, policy engine, and adapters are
> tracked as v0.1 backlog issues — follow the [project board](https://github.com/orgs/tierfall/projects)
> for progress. Tests for unimplemented behavior are red on purpose (TDD).

## Try the demo

```bash
git clone https://github.com/tierfall/tierfall
cd tierfall
docker compose -f apps/demo-cli/docker-compose.yml up
```

No API keys required — the demo runs against a containerized Ollama with `llama3.2:3b`.
Add keys via `cp apps/demo-cli/.env.example .env` to see cloud-tier scenarios.

## Roadmap

| Version | Scope                                     | Soft target |
| ------- | ----------------------------------------- | ----------- |
| v0.1    | Foundation: core + 3 adapters + Node demo | Q3 2026     |
| v0.2    | Browser: WebLLM + transformers.js         | Q4 2026     |
| v0.3    | React Native: llama.rn                    | Q1 2027     |
| v0.4    | Tool calls + structured output            | Q2 2027     |
| v0.5    | Response + semantic caching               | Q3 2027     |
| v1.0    | Vercel AI SDK compatibility shim          | Q4 2027     |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the canonical contribution rules.
Looking for a first issue? Filter by [good-first-issue](https://github.com/tierfall/tierfall/labels/good-first-issue).

## License

Apache-2.0
