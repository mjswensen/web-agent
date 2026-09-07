---
id: 9
created: 2026-09-07
depends-on: []
---

# Add provider authentication to the web UI

## Description

Expose Pi's public `ModelRuntime` authentication workflows through the web UI so users can configure and remove provider credentials without editing `~/.pi/agent/auth.json` or restarting Web Agent.

Implement authentication as a browser-specific interaction bridge rather than reproducing provider logic. A dedicated server-side auth controller should use the existing shared `ModelRuntime` and its public APIs (`getProviders`, `checkAuth`, `listCredentials`, `login`, `logout`, and `getAvailable`). Keep it separate from the agent command adapter and do not create another Pi runtime, subprocess, WebSocket endpoint, or `Bun.serve` server.

Pi's `AuthInteraction` should map to a targeted, multi-step browser protocol. Starting a login returns a flow ID immediately. Provider notifications and prompts are then sent only to the originating tab, and prompt replies include flow and prompt IDs so stale replies cannot satisfy a newer prompt. Support text, secret, select, and manual-code prompts plus informational links, OAuth URLs, device codes, and progress events. Allow cancellation, abort pending work when the initiating tab disconnects or the server shuts down, and serialize credential mutations across tabs.

Add a Providers dialog reachable from the unconfigured recovery panel, model selection, and an appropriate header or action menu control. The dialog should list non-secret provider status and available API-key/subscription methods, then render the provider-owned login flow as an accessible wizard. It must support labeled inputs, external authorization links, copyable device codes, visible progress, keyboard operation, focus management, an `aria-live` progress region, and 44-by-44 CSS-pixel critical controls.

After login, recompute available models, publish authoritative provider/model status to all tabs, and allow the originating user to select a model if the session does not already have an authenticated model. Sending must remain disabled until an authenticated model is selected. After logout, check authentication again because environment variables and ambient credentials may still configure the provider; if the active model is no longer available, require a valid replacement rather than deferring failure to the next prompt. Preserve the existing policy that disables automatic model-catalog network refresh.

Treat browser credential entry as security-sensitive. Validate WebSocket origins before enabling it, never log, echo, snapshot, or broadcast secret values, clear secret client state after submission, render provider text as plain text, and permit only validated HTTP(S) authorization links with `noopener`/`noreferrer`. Browser auth should remain disabled by default when Web Agent binds beyond loopback unless the user explicitly opts in, with clear warning that remote HTTP/WebSocket traffic is unencrypted. Test and document that loopback-callback OAuth providers may not work when the browser and Web Agent run on different machines; use Pi's public flows unchanged rather than private provider logic.

The existing `registerBunOAuthFlows()` registration must remain in place so supported OAuth implementations are embedded in standalone executables.

## Acceptance criteria

- [ ] The web UI lists Pi providers, supported auth methods, and non-secret authentication status using the existing shared `ModelRuntime`.
- [ ] Users can complete provider-owned API-key flows, including multi-field and select prompts, and credentials persist through Pi's normal `auth.json` storage.
- [ ] Supported OAuth flows render auth URLs, informational links, device codes, manual-code prompts, and progress notifications through a generic interaction UI.
- [ ] Login events and prompts are delivered only to the originating tab; secret values never appear in broadcasts, reconnect snapshots, logs, errors, or response payloads.
- [ ] Each auth flow uses flow and prompt IDs, supports cancellation, aborts on originating-tab disconnect and shutdown, and rejects concurrent credential mutations predictably.
- [ ] Successful authentication updates model/provider state without restarting Web Agent, and Send becomes available only after an authenticated model is selected.
- [ ] Logout removes only stored credentials, rechecks ambient authentication, and safely handles an active model that becomes unavailable.
- [ ] The auth UI is keyboard and touch accessible, manages focus, announces progress, and safely handles external links and untrusted provider text.
- [ ] WebSocket origin validation protects auth commands, and browser credential entry is gated behind explicit opt-in when listening beyond loopback.
- [ ] Automatic model-catalog network refresh remains disabled, and `PI_OFFLINE` behavior is preserved.
- [ ] Unit tests cover every prompt/event shape, origin-tab routing, secret redaction, cancellation, disconnects, stale replies, concurrent flows, logout with ambient credentials, and availability transitions using fake providers only.
- [ ] End-to-end tests exercise setup and logout with fake authentication and require no real provider credentials.
- [ ] Standalone executable verification confirms OAuth loaders and the auth UI remain embedded with clean `HOME`, restricted `PATH`, `PI_OFFLINE=1`, and no adjacent assets or dependencies.
- [ ] README documentation explains credential persistence, logout semantics, non-loopback risks, and remote OAuth callback limitations.
