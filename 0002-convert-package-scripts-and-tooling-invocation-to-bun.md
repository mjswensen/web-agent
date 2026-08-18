---
id: 2
created: 2026-08-15
---

# Convert package scripts and tooling invocation to Bun

## Description

Update package scripts and test-server commands so routine development, build, validation, and lifecycle work is invoked through Bun rather than npm or Node.

## Acceptance criteria

- [ ] Build, start, dev, validation, test, and lifecycle scripts run through `bun`/`bun run`.
- [ ] The package-copy build step no longer uses inline `node -e`.
- [ ] Chained scripts do not invoke npm.
- [ ] Playwright's configured web server uses the Bun-based commands.
- [ ] Existing Vite, Svelte, ESLint, Vitest, and Playwright coverage remains available.
