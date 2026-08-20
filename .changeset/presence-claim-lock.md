---
'cyberlegion': patch
---

`unit claim`/`unit claim --clear` (`identity.ts`'s `claimPresence`/`clearPresence`) now serialize
their load-mutate-save of a standing owner's presence pointer behind the store's advisory lock,
matching `setMainPane`. Two concurrent claims (or a claim racing a clear) against the same standing
owner previously read-modified-wrote the record unguarded; the last-claim-wins semantics are
unchanged, but the transition itself is now atomic rather than racing two processes' independent
reads against each other.
