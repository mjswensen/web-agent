---
id: 1
created: 2026-08-15
---

# Establish Bun as the supported runtime and package manager

## Description

Make Bun the project's declared runtime and package manager. Pin the supported Bun release, migrate the dependency lockfile, and update repository documentation that currently describes Node.js/npm as the supported environment.

## Acceptance criteria

- [ ] `package.json` declares the pinned Bun package manager version.
- [ ] A committed Bun lockfile replaces `package-lock.json`.
- [ ] Ignore rules and installation guidance are consistent with Bun.
- [ ] `README.md`, `CONTEXT.md`, and contributor instructions describe Bun commands and requirements.
