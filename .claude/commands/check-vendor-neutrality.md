---
name: check-vendor-neutrality
description: Audit README, docs, and demo for vendor-neutrality violations
---

Run the following audit and report findings:

1. **README rotation:** grep root README + apps/docs/content/docs/\*_/_.mdx for each adapter
   name (Ollama, OpenAI, Anthropic, Groq, DeepSeek, Cerebras). Report counts. If any single
   vendor appears >2× the median, flag it.

2. **Adapter export symmetry:** for each `packages/adapter-*/src/index.ts`, list the exports.
   Adapters should expose the same shape (`*Adapter` class, `*AdapterConfig` interface). Flag
   asymmetries unless intentional (e.g., `presets` sub-export for openai-compatible).

3. **Hardcoded model strings:** grep `packages/**/src/**/*.ts` (excluding presets.ts) for
   string literals matching common model names. Report each occurrence — these should live in
   user config or in presets.ts, not in adapter implementations.

Output a markdown summary with sections per check, listing violations or "no findings".
