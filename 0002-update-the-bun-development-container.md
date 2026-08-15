---
id: 2
created: 2026-08-15
---

# Update the Bun development container

## Description

Convert the dev container from its Node image and npm/npx lifecycle commands to a pinned Bun environment, while preserving Pi setup, Playwright prerequisites, the non-root development user, and port forwarding.

## Acceptance criteria

- [ ] `.devcontainer/Dockerfile` uses a pinned official Bun image and valid user/sudo setup.
- [ ] `devcontainer.json` runs frozen Bun installation and uses `bunx` for Playwright.
- [ ] Pi installation and the existing port mapping remain intact.
- [ ] The rebuild guidance accounts for preserving the user's Pi state.
