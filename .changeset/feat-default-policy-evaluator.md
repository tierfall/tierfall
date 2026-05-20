---
'@tierfall/core': minor
---

Implement the `DefaultPolicy.evaluate` declarative evaluator. Given a request and an adapter list, returns the filtered + sorted subset the Router should attempt:

- Filters by `request.requires.{minContextWindowTokens, tools, streaming, structuredOutput}` (AND)
- Filters by `request.maxCostUSD` using a 500-input + 500-output token budget
- Stable-sorts survivors by tier-index ascending (premium-cloud → on-device)
- Empty result surfaces impossible-to-satisfy requests via the Router constructor's empty-list throw

Closes #3.
