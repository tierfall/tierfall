---
name: cluster-1
description: 'Skill for the Cluster_1 area of tierfall. 4 symbols across 4 files.'
---

# Cluster_1

4 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `packages/`
- Understanding how AnthropicAdapter, OllamaAdapter, OpenAICompatibleAdapter work
- Modifying cluster_1-related functionality

## Key Files

| File                                                | Symbols                 |
| --------------------------------------------------- | ----------------------- |
| `packages/adapter-anthropic/src/adapter.ts`         | AnthropicAdapter        |
| `packages/adapter-ollama/src/adapter.ts`            | OllamaAdapter           |
| `packages/adapter-openai-compatible/src/adapter.ts` | OpenAICompatibleAdapter |
| `packages/core/src/adapter.ts`                      | Adapter                 |

## Entry Points

Start here when exploring this area:

- **`AnthropicAdapter`** (Class) — `packages/adapter-anthropic/src/adapter.ts:18`
- **`OllamaAdapter`** (Class) — `packages/adapter-ollama/src/adapter.ts:17`
- **`OpenAICompatibleAdapter`** (Class) — `packages/adapter-openai-compatible/src/adapter.ts:20`
- **`Adapter`** (Interface) — `packages/core/src/adapter.ts:18`

## Key Symbols

| Symbol                    | Type      | File                                                | Line |
| ------------------------- | --------- | --------------------------------------------------- | ---- |
| `AnthropicAdapter`        | Class     | `packages/adapter-anthropic/src/adapter.ts`         | 18   |
| `OllamaAdapter`           | Class     | `packages/adapter-ollama/src/adapter.ts`            | 17   |
| `OpenAICompatibleAdapter` | Class     | `packages/adapter-openai-compatible/src/adapter.ts` | 20   |
| `Adapter`                 | Interface | `packages/core/src/adapter.ts`                      | 18   |

## How to Explore

1. `gitnexus_context({name: "AnthropicAdapter"})` — see callers and callees
2. `gitnexus_query({query: "cluster_1"})` — find related execution flows
3. Read key files listed above for implementation details
