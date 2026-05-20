# @tierfall/adapter-openai-compatible

[TierFall](https://github.com/tierfall/tierfall) adapter for any OpenAI-compatible
Chat Completions endpoint (Groq, DeepSeek, OpenAI, Cerebras, OpenRouter, vLLM, ...).

## Install

```bash
pnpm add @tierfall/core @tierfall/adapter-openai-compatible
```

## Usage

> Implementation pending — see issues #6 (adapter) and #7 (presets). The skeleton
> compiles and exposes the configuration surface; calling `complete()` or any
> preset factory throws "not yet implemented".

```ts
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';

const groq = new OpenAICompatibleAdapter(presets.groq());
```

## License

Apache-2.0
