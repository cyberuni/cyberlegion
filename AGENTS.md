# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Skill Augmentations

When reading any `SKILL.md` file, always check whether a `SKILL.local.md` exists in the same directory. If it does, treat its contents as additional instructions that extend the base skill. Local augmentations take precedence over the base skill where they conflict.

## Commit Discipline

**Auto-commit rule:** When a unit of work is complete and verified, commit it immediately — do not wait for the user to ask. Batching multiple units into one commit, or finishing all work before committing, are both violations of this rule.

**Unit of work:** one coherent, independently revertable change — one domain's refactor, one feature, one bugfix, one test suite expansion for one concern, one config change. Never two unrelated concerns in the same commit. A TDD red-green-refactor cycle alone is not a commit boundary; commit when the full intended change is complete and tests pass. If the working tree has unrelated changes, leave them unstaged — commit the current unit first, then continue.

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- One concern per commit; never batch unrelated changes
- Stage only files for this unit: `git add <files>`, then verify with `git diff --cached`
- Never use `git add .`, `git add -A`, or `git add -p` (interactive commands agents cannot run)
- Never commit with red tests; run validation commands first

### References

- **`commit-work` skill** — staging, splitting, and message writing when committing
- `npx cyber-skills@<version> governance show skill-repo-structure` — discipline section format rules

## Development Workflow

Before writing any production code, invoke the `test-driven-development` skill. This applies whether coding starts from a user request or from your own initiative after plan approval.

## Design Discussion

Design here is worked out by argument, not by presenting a finished plan. Proposals get
challenged on specifics, and that is the process working.

- **Recommend, don't enumerate.** Open design questions get prose with a clear
  recommendation and its reasoning. A menu of options pushes the thinking back onto the
  reader; multiple-choice prompts are a poor fit for questions still being framed.
- **Concede the specific point, not the whole position.** When a step in your reasoning
  is shown to be wrong, say which step and why, and keep what still stands. Retracting
  wholesale to end a disagreement destroys the useful part of the proposal and hides
  which claim actually failed.
- **Defend what holds.** Agreement that isn't earned is worse than disagreement — if the
  objection doesn't land, say so and explain why.
- **Explain intent when asked, rather than withdrawing.** "Why did you propose that?"
  is a request for the reasoning, not a signal to drop it.
- **Say which frame you are in.** A decision about how the system is *set up* is not a
  decision about how it *runs*. Carrying momentum from one into the other produces
  designs that answer the wrong question — check the frame before generalising a
  solution into an architecture.
- **Mark what is load-bearing.** Separate decisions that are expensive to unwind from
  ones that can be revisited cheaply, and say which is which.
- **Test each rung of a ladder before proposing it.** A layered scheme is only worth
  proposing if each layer catches what you claim; verify rather than assume, since a
  layer that appears to help while laundering the defect is worse than no layer.

Rejected proposals are recorded with their reasons in `docs/backlog.md` under
*Settled — do not re-derive*. Read it before re-proposing anything in that list.

## What This Repo Is

`cyberlegion` — harness-agnostic, MCP-free agent session spawning and messaging over the
filesystem (Claude Code, Cursor, Codex). It ships as two workspace members:

- `packages/cyberlegion/` — the npm package, published as `cyberlegion`, powered by Commander. This is the CLI: pure mechanism, no routing judgment.
- `plugins/cyberlegion/` — the agent plugin (the **Legate**) that composes the CLI's primitives into routing decisions, plus the skills and the `headless-legate` subagent that back it.

Unlike a repo where the npm package root doubles as the plugin root, cyberlegion keeps these as
two separate workspace members — the CLI is a general-purpose mechanism a routing layer builds
on, and the plugin is one particular consumer of it (others, like `cyberfleet`, import the CLI's
library surface directly instead).

It is deliberately **not** an MCP server. Coordination acts on filesystem state under a shared
hub root, through a shell command and skills, not through a remote API or a long-lived process.

### Plugin layout

Everything the plugin needs lives in `plugins/cyberlegion/` and must stay listed in that
package's manifests, or a client won't discover it.

| Path | Read by |
| --- | --- |
| `.plugin/plugin.json` | cyberuni's canonical universal-plugin source; not published |
| `.codex-plugin/plugin.json` | Codex |
| `skills/<name>/SKILL.md` | All of them (fixed location) |
| `agents/<name>.md` | Claude Code (and any client that reads Agent Plugins subagents) |

`.claude-plugin/marketplace.json` at the **repo root** lists the plugin with a local directory
source (`./plugins/cyberlegion`) rather than an npm source, since the plugin is not itself
published to npm. Version bumps flow from `packages/cyberlegion/package.json` through
`scripts/sync-plugin-version.mjs` on `pnpm version` — add any new manifest to that script's list.

## Commands

```
pnpm test                        # all package tests
pnpm cl test src/message.test.ts  # run one test file
pnpm verify                      # lint + build + typecheck + test + knip
pnpm build                       # compile to dist/
pnpm cl dev --help                # run the CLI from source (tsx)
pnpm web dev                     # run the docs site locally
```

`pnpm cl <script>` is the root shortcut for `pnpm run --filter=./packages/cyberlegion <script>`.

## Layout

```
packages/cyberlegion/   the npm package — the CLI, pure mechanism
plugins/cyberlegion/    the agent plugin — the Legate, its skills, and headless-legate
apps/web/               Astro + Starlight docs site, deployed to GitHub Pages
docs/adr/               architecture decision records
.research/              background research dossiers behind ADRs and design decisions
scripts/                repo maintenance scripts
```

## Key Conventions

### Agent-friendly output

The CLI follows the [10 agent-CLI principles](https://github.com/kunchenguid/axi#the-10-principles). Keep new commands consistent:

- **Structured output** goes through `src/output.ts` (`emit`, `toonObject`, `toonList`); TOON is the default, `--format json` the escape hatch. Never branch on `process.argv` for format inside a command.
- **Empty states**: `toonList` is definitive on empty — it still emits the `name[0]{...}:` header plus a summary line, never a blank line.
- **Next steps and failures**: use `nextStep` / `fail` from `src/output.ts` to write to stderr; stdout carries only the machine result.
- **Global options**: `--space <path>` isolates the hub root; `--format <format>` selects `toon` (default) or `json`.

### Version

`src/cli.ts` currently hardcodes `VERSION = '0.0.0'` for `.version()` rather than reading
`packages/cyberlegion/package.json` at runtime — a pre-existing gap carried over from the
monorepo, not something this scaffold fixes. Reading it at runtime (rather than importing the
JSON, which a bundler could inline) is the convention to converge on when this is addressed.
