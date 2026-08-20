---
title: 'CLI: admin'
description: "CLI reference for cyberlegion admin: migrate — merge one hub root's state into another."
---

```sh
npx cyberlegion admin migrate --from <path> --to <path>
```

`admin` is hub-state maintenance. Its one subcommand, `migrate`, merges one hub root's state
(agents, messages, briefs) into another — for example, folding an old project-local root into the
global hub.

## Options

| Option | Meaning |
|---|---|
| `--from <path>` | source hub root (required) |
| `--to <path>` | destination hub root (required) |

## Output

`agents`, `messages`, `briefs` — counts of each record type merged from the source into the
destination.

## Related

- [Architecture](/concepts/architecture/) — the hub root and where state lives
- [CLI: unit](/cli/unit/) · [CLI: mail](/cli/mail/) — the record types this command merges
