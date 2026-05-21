# `@tierfall-app/docs` — Claude context

## Purpose

The public documentation site for TierFall, hosted at `tierfall.github.io/tierfall`. No custom domain is planned for v0.1; the GitHub Pages URL is the canonical one.
Built with [Fumadocs](https://fumadocs.dev) on Next.js 16 / React 19. Lives
outside the published packages — exists to give readers a single canonical
place for the project's concepts, adapter guides, and migration notes.

## Scaffold status (this commit)

- Landing page at `app/(home)/page.tsx` describes the four tiers and the
  "fall, never climb" rule.
- Docs at `app/docs/[[...slug]]/page.tsx` render MDX from `content/docs/`.
- `content/docs/index.mdx` is the welcome page with the v0.1 status banner.
- `content/docs/concepts/tiers.mdx` is a **placeholder stub** — full content
  ships via issue #10.
- No search index, no API reference, no migration notes yet. Those land in
  later docs-tagged issues.

## Files

- `app/layout.tsx` — root layout, wraps everything in Fumadocs' `RootProvider`.
- `app/(home)/page.tsx` — landing page using a route group so it bypasses the
  docs shell.
- `app/docs/layout.tsx` — docs shell with sidebar from `lib/source.ts`'s
  page tree.
- `app/docs/[[...slug]]/page.tsx` — catch-all MDX renderer.
- `lib/source.ts` — wraps the generated `.source` collection with Fumadocs'
  `loader()`, exposes `source.pageTree`, `source.getPage`, etc.
- `mdx-components.tsx` — extends Fumadocs' default MDX components.
- `source.config.ts` — declares the `docs` collection rooted at `content/docs/`.
- `content/docs/**` — the actual MDX pages and `meta.json` navigation.
- `next.config.mjs` — wraps Next config with `createMDX()` from `fumadocs-mdx/next`.

## Dev quickstart

```bash
pnpm --filter @tierfall-app/docs dev
# → http://localhost:3000
```

`fumadocs-mdx` runs as a postinstall hook and again in `dev` / `build` to
generate `.source/`. That directory is gitignored — never commit it.

## Future docs (issue #10 and onwards)

Replaces the v0.1 stubs with the full concept guide: the fall algorithm,
adapter capability contracts, policy DSL, observability, plus per-adapter
quickstarts. Mermaid diagrams of the tier ladder will land here.

## Gotchas

- Next 16 has removed the `next lint` subcommand — the `lint` script invokes
  ESLint directly (`eslint --max-warnings=0 --quiet app lib`). `next build`
  no longer runs ESLint at all.
- `.source/` is generated MDX type info. It's in `.gitignore`, in
  `.prettierignore`, and in the root ESLint `ignores` list. Don't write to
  it; regenerate via `pnpm --filter @tierfall-app/docs build` (or `dev`).
- React 19 + strict TS 6 + Fumadocs' generated types interact subtly. If
  `typecheck` flags a type from `.source/`, regenerate it (the script runs
  before `tsc --noEmit` in the `typecheck` target).
- Tailwind is **not** wired in this app — Fumadocs ships a pre-compiled
  `style.css` we import from `fumadocs-ui/style.css`. Adding Tailwind back
  in is a future call once we need custom Tailwind utility classes.
