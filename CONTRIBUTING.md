# Contributing

Guide for developing `cyberlegion` locally. AI coding assistants should also read [AGENTS.md](AGENTS.md).

## Setup

```sh
pnpm install
```

Node 22+ and pnpm 11 — both pinned in `mise.toml` and `.node-version`.

## Build and test

```sh
pnpm verify              # lint + build + typecheck + test + knip — what CI runs
pnpm test                # tests only
pnpm cl dev --help       # run the CLI from source, no build (tsx)
pnpm cl test:watch       # watch mode
```

`pnpm cl <script>` is the root shortcut for `pnpm run --filter=./packages/cyberlegion <script>`.

## Docs site

The site is Astro + Starlight in `apps/web`, deployed to GitHub Pages by
`.github/workflows/deploy-docs.yml` on any push to `main` that touches `apps/web/**`.

```sh
pnpm web dev       # local dev server
pnpm web build     # production build
```

Pages live in `apps/web/src/content/docs/`.

## Releasing

Changesets drives versions and the changelog; publishing is secretless (npm trusted
publishing over OIDC).

```sh
pnpm changeset     # describe the change and its bump level
```

Merging to `main` opens a version PR; merging *that* publishes. `pnpm version` runs
`scripts/sync-plugin-version.mjs`, which carries the new version into the plugin
manifests under `plugins/cyberlegion/` — add any new manifest to that script's list.

## Commits

Conventional Commits, enforced by commitlint on `commit-msg`. The `pre-commit` hook runs
`biome check` and the test suite, so a red tree cannot be committed.
