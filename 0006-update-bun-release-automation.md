---
id: 6
created: 2026-08-15
---

# Update Bun release automation

## Description

Simplify release CI now that the dev container provides Bun, and make all release build steps use the pinned Bun toolchain.

## Acceptance criteria

- [ ] The workflow reads package metadata with Bun.
- [ ] The release command removes the curl Bun installation, PATH mutation, and redundant Bun-version export.
- [ ] Dependencies are installed with Bun's frozen-lockfile mode and the application is built through Bun scripts.
- [ ] The existing Linux, macOS, and Windows `bun build --compile` assets and installer artifact remain published.
