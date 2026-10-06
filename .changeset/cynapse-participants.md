---
"cyberlegion": minor
---

When [cynapse](https://github.com/cyberuni/cynapse) is installed beside it, cyberlegion registers its units as cynapse participants (stage 1 of #153). Each unit is `live` while it exists and `retired` once it is exited or closed, a new handle renames it, and every sync reconciles the whole hub, so a crash is corrected by the next run. `project register` and `project show` resolve the repository's GitHub node id, pass it to cynapse, and report the channel cynapse keys by it. cynapse is an optional peer dependency: without it, nothing changes and nothing extra runs. Mail still goes through the hub.
