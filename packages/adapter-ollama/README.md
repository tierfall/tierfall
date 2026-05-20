# @tierfall/adapter-ollama

On-device [TierFall](https://github.com/tierfall/tierfall) adapter for [Ollama](https://ollama.com).

## Install

```bash
pnpm add @tierfall/core @tierfall/adapter-ollama
```

## Usage

> Implementation pending — see issue #5. The skeleton compiles and exposes
> the configuration surface; calling `complete()` throws "not yet implemented".

```ts
import { OllamaAdapter } from '@tierfall/adapter-ollama';

const ollama = new OllamaAdapter({
  model: 'llama3.2:3b',
  baseUrl: 'http://localhost:11434',
});
```

## License

Apache-2.0
