---
'cyberlegion': patch
---

`mail send --to <handle>` and the verbs that take a unit ref now fail loud, naming the ids, when a handle names two or more live records — such as the service endpoints of two same-named repositories. They used to take the first match silently, so mail could land in the wrong endpoint. A standing record still wins a handle it shares; address any other ambiguous unit by id.
