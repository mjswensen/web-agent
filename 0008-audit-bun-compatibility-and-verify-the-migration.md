---
id: 8
created: 2026-08-15
---

# Audit Bun compatibility and verify the migration

## Description

Validate the complete migration against dependency compatibility and the application's critical runtime guarantees, including the standalone binaries.

## Acceptance criteria

- [ ] Dependencies are confirmed compatible with the pinned Bun release, with upgrades limited to genuine blockers.
- [ ] Check, lint, unit, E2E, and production build commands pass under Bun.
- [ ] Development and production startup, CLI help/errors, port fallback, browser opening, and Pi restart/shutdown are exercised.
- [ ] WebSocket bootstrap/reconnect and multi-tab command-response and broadcast semantics are verified.
- [ ] Release artifacts are validated on each supported target where CI permits.
