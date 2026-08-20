---
'cyberlegion': patch
---

Hardened `FileStore` against the concurrency and corruption risks a filesystem-only,
daemonless, multi-process mailbox is actually exposed to (surveyed from `agmsg` and
`firstmate`, two comparable tools, in `.research/messaging-robustness/evidence.md`):

- Every store mutation (`putMessage`, `putAgent`, `putPaneIndex`, `writeBrief`,
  `setMainPane`) now writes atomically — a sibling temp file, then `renameSync` into place —
  instead of `writeFileSync` on the final path directly. A process crash mid-write, or a
  reader racing a writer, can no longer hand `JSON.parse` a truncated file.
- Added an advisory, mkdir-based lock (`store/lock.ts`, `Store#withLock`) for genuine
  read-modify-write operations such as `setMainPane`'s rebind. It reclaims a lock abandoned
  by a confirmed-dead process but never steals one a live process still holds.
- A corrupt record file now throws a typed, file-named `CorruptRecordError` instead of a
  bare `SyntaxError`; missing and corrupt records stay distinguishable.
- An agent or message id that would traverse outside its intended path segment (`../`, an
  absolute path, an embedded path separator) is now rejected with a typed `InvalidIdError`
  on write, rather than being joined into a filename unchanged.
