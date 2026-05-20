---
'@tierfall/core': minor
---

Implement the five blessed presets in `@tierfall/adapter-openai-compatible/presets`: `groq`, `deepseek`, `openai`, `cerebras`, `openrouter`. Each returns a partial `OpenAICompatibleAdapterConfig` with vendor-correct base URL, default model, default tier, and realistic per-provider pricing.

```ts
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';

const adapter = new OpenAICompatibleAdapter(
  presets.deepseek({ apiKey: process.env.DEEPSEEK_API_KEY! }),
);
```

Override semantics: top-level fields use shallow merge; `capability` deep-merges one level.

This PR also closes the v0.1 red-TDD chain. `presets.test.ts` was the last red test in `test-rest`; the job's `continue-on-error: true` is removed by this PR. After merge, `test-rest` is a required check on `develop` and `main` (out-of-band branch-protection update required).

Closes #7.
