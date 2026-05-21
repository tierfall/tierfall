# @tierfall-app/docs

The public documentation site for [TierFall](https://github.com/tierfall/tierfall),
built with [Fumadocs](https://fumadocs.dev) on Next.js 16.

## Local development

```bash
pnpm install
pnpm --filter @tierfall-app/docs dev
```

Then open <http://localhost:3000>.

## Build

```bash
pnpm --filter @tierfall-app/docs build
```

Outputs a production-optimized site into `apps/docs/.next/`.

## Authoring docs

- Pages live under `content/docs/` as MDX files.
- Navigation order and folder titles come from `meta.json` siblings.
- See [Fumadocs' docs](https://fumadocs.dev/docs/mdx) for frontmatter,
  callouts, and code-block syntax.

## Status

This is the v0.1 scaffold — only a landing page and a concepts stub. Full
content lands via the docs-tagged issues in the project board.
