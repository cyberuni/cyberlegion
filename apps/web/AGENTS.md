# AGENTS.md

Guidance for the docs site. The repo-wide rules in the root [AGENTS.md](../../AGENTS.md) still
apply.

## What This Is

Astro + Starlight docs for cyberlegion, deployed to GitHub Pages. The site is served from a
`base` path (`/cyberlegion`), so local dev URLs are `http://localhost:4321/cyberlegion/...`, not
the bare root.

## Commands

```sh
pnpm web dev       # local dev server
pnpm web build     # production build
pnpm web test      # unit tests (src/**/*.test.ts)
```

## Moving a Page

1. `git mv` the file, keeping its front matter.
2. Grep the whole site for inbound links to the old path and update them:
   ```sh
   grep -rn 'old-slug' apps/web/src/content
   ```
3. If the page was reachable via the sidebar's `autogenerate`, nothing to update there — the
   sidebar re-derives from the directory. If it had an explicit `link:` entry in
   `astro.config.mjs`, update that too.
4. Check for duplicated content elsewhere on the site before moving — a move is a good time to
   fold near-duplicates together instead of leaving two copies live.
5. Disambiguate the sidebar label if the new location makes an existing label ambiguous.
6. Grep for anchor references (`#some-heading`) into the moved page, in case headings changed.
7. Build and crawl for broken internal links:
   ```sh
   pnpm web build
   cd apps/web/dist && for f in $(find . -name '*.html'); do grep -o 'href="/cyberlegion/[a-z0-9/-]*"' $f; done \
     | sort -u | sed 's|href="/cyberlegion/||;s|"||' \
     | while read p; do [ -f "./$p/index.html" ] || [ -z "$p" ] || echo "BROKEN: /$p"; done
   ```

## Interactive Components

A component that does anything beyond static markup should split into a pure, DOM-free
`src/lib/<name>.ts` module (unit-tested with a co-located `.test.ts`) behind a thin
`.astro` renderer that just wires the DOM. Any `requestAnimationFrame` loop must stop once the
scene has settled, rather than running forever, and must respect
`prefers-reduced-motion`. A page that embeds such a component needs the `.mdx` extension, not
`.md`.

## Starlight Reaches Inside Your Components

Starlight's `.sl-markdown-content` descendant selector applies auto-margins to its children,
which can silently override spacing a custom component sets. The `not-content` class is the
escape hatch. Starlight's own styles live behind `@layer`, which makes them invisible to
`document.styleSheets` introspection from a component's own script — don't rely on reading them
back at runtime.
