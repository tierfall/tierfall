# @tierfall/core

The core router, Adapter interface, and types for [TierFall](https://github.com/tierfall/tierfall).

## Install

```bash
npm install @tierfall/core
```

## Usage

Import the `Adapter` interface, implement it in your own adapter package (or use
one of the official adapters: `@tierfall/adapter-ollama`,
`@tierfall/adapter-openai-compatible`, `@tierfall/adapter-anthropic`), and pass
the resulting list to `Router`.

```ts
import { Router } from '@tierfall/core';
// full example lands in the v0.1 docs (issue #10).
```

## License

Apache-2.0
