---
title: 'CLI: project'
description: 'CLI reference for cyberlegion project: register, list, and resolve a stable project reference shared by every checkout of a repository.'
---

```sh
npx cyberlegion project <register|list|show> ...
```

A project is one git repository. Its id comes from the repository's git common dir, which the
default checkout and every linked worktree share, so all of them resolve to the same project. Two
unrelated repositories that happen to share a directory name get different ids. The id never
depends on a pane or a display name. See [ADR-0033](https://github.com/cyberuni/cyberlegion/blob/main/docs/adr/0033-project-services-fenced-ownership.md).

## register

```sh
npx cyberlegion project register [--dir <path>]
```

Register the project containing `--dir` (default: the current directory). Any checkout works.
Registering again is idempotent and keeps the original registration time. Fails outside a git
repository. Output: `id`, `name` (the default checkout's directory name), `root` (the default
checkout).

The default checkout records its own root. A linked worktree of a repository whose git dir lives
elsewhere (`git init --separate-git-dir`) cannot see that checkout, so registering from it keeps a
root already on record. Before the default checkout has registered, it records the git dir's parent
as a best guess.

## list

```sh
npx cyberlegion project list
```

List the registered projects, with a definitive count line even when there are none.

## show

```sh
npx cyberlegion project show <ref>
```

Resolve a project from anywhere. `<ref>` is tried as an id, then as a path inside any of its
checkouts, then as a name. A path registers its project on first use, so `project register` is
optional. A name only resolves a project that is already registered, and a name that more than one
registered project carries fails and lists the candidate ids.

## Related

- [CLI: service](/cyberlegion/cli/service/): services are owned per project
