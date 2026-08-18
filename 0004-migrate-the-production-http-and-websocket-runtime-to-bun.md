---
id: 4
created: 2026-08-15
---

# Migrate the production HTTP and WebSocket runtime to Bun

## Description

Migrate the production server from Node `http` and `ws` to one native `Bun.serve` instance, without changing the shared Pi process or browser protocol architecture.

## Acceptance criteria

- [ ] Normal SvelteKit requests and `/ws` upgrades share one `Bun.serve` server.
- [ ] Only `/ws` is upgraded; development HMR remains unaffected.
- [ ] Browser-frame validation, response correlation, broadcast behavior, and close semantics are preserved.
- [ ] The server remains loopback-by-default and continues its documented port-fallback behavior.
- [ ] Node `http`, stream upgrade types, and the `ws` server dependency are removed from production runtime code.
