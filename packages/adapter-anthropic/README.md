# @tierfall/adapter-anthropic

Premium-cloud [TierFall](https://github.com/tierfall/tierfall) adapter for
[Anthropic](https://www.anthropic.com)'s Messages API.

## Install

```bash
pnpm add @tierfall/core @tierfall/adapter-anthropic
```

## Usage

> Implementation pending — see issue #8. The skeleton compiles and exposes
> the configuration surface; calling `complete()` throws "not yet implemented".

```ts
import { AnthropicAdapter } from '@tierfall/adapter-anthropic';

const claude = new AnthropicAdapter({
  model: 'claude-3-5-sonnet-latest',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## License

Apache-2.0
