---
id: 6
created: 2026-08-15
---

# Migrate subprocess and filesystem integration to Bun

## Description

Replace Node-specific child-process and supporting runtime integration with Bun-native subprocess and stream APIs, preserving the security and protocol guarantees around Pi and Git.

## Acceptance criteria

- [ ] Pi and Git process execution use Bun-native APIs or documented Bun-compatible abstractions.
- [ ] Pi stdout remains incrementally decoded as strict LF-only JSONL.
- [ ] Pi stdin still writes exactly one JSON record plus LF and waits for completion.
- [ ] Graceful termination, force-kill fallback, Git allowlists, timeouts, and output limits are retained.
- [ ] Deterministic tests use explicit Bun-compatible subprocess/stream fakes rather than Node child-process types.
