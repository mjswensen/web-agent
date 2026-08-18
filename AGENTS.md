# Agent instructions for Web Agent

## Start here

1. Read [`CONTEXT.md`](./CONTEXT.md) for the repository map and current implementation notes.
2. Read the relevant section of [`SPECIFICATION.md`](./SPECIFICATION.md) before changing product behavior.
3. Check [`README.md`](./README.md) and `package.json` for supported usage and verification commands.
4. Inspect the existing module and its adjacent tests before editing. Keep changes within the established boundaries.

## Project rules

### Architecture

- Keep one adapter-bun-owned `Bun.serve` server and one `/ws` upgrade endpoint. Do not introduce a second application server or a second Pi child.
- Keep process transport, RPC brokering, WebSocket handling, SDK session listing, and client reduction in separate modules. Do not turn the broker or page into an opaque all-in-one implementation.
- Pi is integrated through documented JSONL RPC. Use the Pi SDK only for persisted session enumeration (`SessionManager.list`/the session-list adapter), never to manipulate the live child `AgentSession`.
- Preserve the CLI resolution order: `--pi`, `PI_BIN`, then `pi` on `PATH`; preserve loopback and port-fallback defaults.
- Treat all browser input and Pi records as untrusted. Validate browser frames before forwarding, handle malformed child records without crashing the HTTP server, and do not enable permissive CORS.

### Svelte and client state

- Use Svelte 5 runes and the repository's conventions: `$state`, `$derived`/`$derived.by`, `$props`, `onclick`, and snippets.
- Do not add legacy `export let`, `on:...`, or slot APIs to new code.
- Keep mutable app state request/client-scoped through `AppState` and the typed Svelte context. Never create a mutable module-level singleton.
- Access `window`, `document`, and `WebSocket` only in browser lifecycle code (`onMount` or equivalent). SSR must remain safe.
- Keep protocol transforms and event reducers pure and idempotent where practical. Snapshots are authoritative during bootstrap/reconnect; reducers must tolerate duplicate or out-of-order-ish streaming updates.
- Render structured messages with stable keyed IDs. Keep thinking separate from assistant text, and sanitize any Markdown-to-HTML output.

### Pi JSONL and RPC

- Pi records are LF-delimited only. Decode UTF-8 incrementally, split only on `\n`, strip one trailing `\r`, and do not use `readline`.
- Write exactly `JSON.stringify(command) + "\n"` to Pi stdin and await write completion.
- Preserve Pi response IDs and correlate each response to the browser request that initiated it. Broadcast live events/snapshots to all tabs, but send command responses to the originating tab.
- Keep stream batching near 16 ms. Retain only the newest cumulative partial tool result per `toolCallId`; flush errors, lifecycle/session events, terminal events, and extension-dialog requests immediately.
- Extension dialogs must result in exactly one Pi response in the shared-tab model. Do not implement a second independent dialog socket or invent unsupported queue/session RPC operations.

### UI and styling

- Follow the existing responsive shell: full-width scrolling conversation, sticky/touch-sized editor controls, compact header/footer, and modal/sheet drawers on narrow screens.
- Use Tailwind's default palette and the existing monospace visual language. Do not load or translate Pi theme JSON.
- New controls need accessible labels, semantic elements, visible focus states, and at least a 44-by-44 CSS-pixel touch target for critical editor actions.
- Never render raw untrusted Markdown/HTML directly. Preserve whitespace safely for tool output and diffs.
- Keep v1 controls honest: tree is view-only except fork/clone/switch actions; queued-message cancellation is intentionally limited because Pi exposes no item-removal command.

## Editing workflow

- Use `functions.read` to inspect files and `functions.edit` for precise existing-file changes. Use `functions.write` for new files or complete rewrites only.
- Keep imports and server-relative imports consistent with the existing ESM TypeScript setup (`.js` extensions in server TypeScript imports).
- Update or add focused tests beside the changed implementation. Prefer pure unit tests for protocol, lifecycle, broker, batching, reducers, and formatting; use E2E only for deterministic user-visible happy paths.
- Do not edit generated output in `build/` or `.svelte-kit/` as the source of truth. Regenerate it with the appropriate command.
- Avoid unrelated formatting churn. Repository formatting is Prettier with tabs, single quotes, no trailing commas, 100-column width, Svelte support, and Tailwind class sorting.
- Do not add credentials, provider-specific fixtures, or tests that require real model access.

## Verification

Run the narrowest relevant checks first, then the broader checks when practical:

```sh
bun run check
bun run lint
bun run test:unit
bun run test:e2e
bun run build
```

`bun run precommit` runs build, check, lint, and tests. `bun run test` runs unit tests and E2E. E2E invokes Playwright browser installation and may require network/system dependencies. The app's runtime tests should use explicit Bun-compatible fake Pi/WebSocket transports rather than real credentials.

For changes affecting startup or the production package, verify both `bun run build`/`bun start` and the CLI behavior where possible. Confirm that the final URL, port fallback, Pi executable errors, shutdown, and `--open` behavior remain clear. For changes affecting shared state, protocol, or session transitions, test reconnect/bootstrap and multiple-tab broadcast semantics.

## Security and scope checklist

Before finishing a change, confirm:

- loopback remains the default bind address;
- non-loopback exposure is not silently made safer/less safe through CORS or auth changes;
- filesystem/shell-capable Pi actions are not exposed through an undocumented browser command;
- no second active Pi session or subprocess was introduced;
- no deferred feature was quietly added in place of the specified v1 behavior;
- user-facing behavior and architecture changes are reflected in `README.md`, `CONTEXT.md`, or `SPECIFICATION.md` as appropriate.
