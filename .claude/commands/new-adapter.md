---
name: new-adapter
description: Scaffold a new TierFall adapter package
---

You will scaffold a new adapter package for TierFall at `packages/adapter-{{name}}`.

Run: `pnpm scaffold:adapter {{name}}`

Then ask the user the following before continuing:

1. What tier does this adapter default to? (on-device / self-hosted-edge / cheap-cloud / premium-cloud)
2. What API shape does this provider use? (OpenAI-compatible / Anthropic Messages / custom)
3. What's the default model recommendation for the README?

Once the user answers, edit the scaffolded files to reflect their answers, write a failing
TDD test for the basic completion path, and open a draft PR titled `feat(adapter-{{name}}): scaffold`
against `develop`. Link to the new adapter issue if one exists.

Do not implement the adapter logic in this command. That belongs in a follow-up task.
