---
id: 3
created: 2026-08-15
---

# Replace the Node SvelteKit adapter with adapter-bun

## Description

Replace the Node-specific SvelteKit adapter and its generated-layout assumptions with the supported Bun adapter and its runtime entry point.

## Acceptance criteria

- [ ] `@sveltejs/adapter-node` is replaced by `@sveltejs/adapter-bun`.
- [ ] SvelteKit adapter configuration follows the selected adapter's supported convention.
- [ ] Build and start scripts target adapter-bun output.
- [ ] The generated app can be composed with the project's single-server `/ws` architecture.
