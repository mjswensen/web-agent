# Web Agent project context

This document is a compact working context for contributors and coding agents. The full product contract is in [`SPECIFICATION.md`](./SPECIFICATION.md); user-facing setup is in [`README.md`](./README.md).

## What this project is

Web Agent is a standalone npm package and Node.js executable (`web-agent`), not a Pi extension. It provides a local, mobile-responsive SvelteKit UI for one long-lived `pi --mode rpc` child process. Every connected browser tab shares the same Pi process, active session, conversation, queue, and session transitions.

The agent has filesystem and shell access through Pi. The default bind address is loopback (`127.0.0.1`); binding to another interface is an intentional security exposure and must remain documented.

## Current stack and package shape

- Package: `@mjswensen/web-agent`, version `0.1.1`, with the executable name `web-agent`.
- Node.js: README requirement is 22.19 or newer.
- ESM TypeScript project using SvelteKit, Svelte 5 runes, Vite, Tailwind CSS 4, and `@sveltejs/adapter-node`.
- Runtime dependencies: `@earendil-works/pi-coding-agent` (session listing only) and `ws` (the `/ws` transport).
- MIT licensed (`LICENSE`).
- Published files are currently `build`, `README.md`, and `LICENSE`; development/context documents are not included by the package `files` allowlist unless that is changed deliberately.

## Runtime architecture

```text
Browser tab(s) -- WebSocket /ws --> one Node/SvelteKit HTTP server
                                      |-- SvelteKit request handler
                                      |-- RpcBroker + shared snapshots/events
                                      |-- SDK SessionManager for saved-session listing
                                      `-- one PiProcess
                                            `-- pi --mode rpc [forwarded Pi args]
```

`src/server/main.ts` owns the shared-server composition. Production uses the adapter-node generated handler plus `src/server/entry.ts`; development attaches the runtime to Vite's own HTTP server through the `webAgentRuntime` plugin in `vite.config.ts`. The WebSocket server must stay on that same HTTP server; do not add a second Express/Hono/server process.

### Pi process and lifecycle

- `src/server/cli.ts` parses Web Agent options and builds child arguments. `--mode rpc` is always added.
- `src/server/pi-binary.ts` resolves Pi in strict precedence: `--pi`, `PI_BIN`, then executable `pi` on `PATH`. An explicitly selected but invalid executable is an error and must not silently fall through.
- `src/server/pi-process.ts` owns the long-lived child, strict LF-delimited JSONL stdin/stdout, stderr diagnostics, and graceful shutdown/force-kill behavior.
- `src/server/pi-lifecycle.ts` combines CLI parsing, binary resolution, child creation, and the SDK session-list provider.
- `src/server/pi-supervisor.ts` permits explicit restart after a crash; it does not run an automatic restart loop.
- The Pi child uses `process.cwd()` as its working directory and receives the same optional `--session-dir` used by session listing.

The intended CLI defaults and forwarding are:

| Input                             | Behavior                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--port <n>`                      | Requested port; overrides `PI_WEB_PORT`                                                                                                                |
| `PI_WEB_PORT` / no port           | Environment port / `3000`                                                                                                                              |
| occupied port                     | Try the next available port upward                                                                                                                     |
| `--host <addr>` / `--bind <addr>` | Listen address; default `127.0.0.1`                                                                                                                    |
| `--open`                          | Open the final URL; otherwise do not open                                                                                                              |
| `--pi <path>` / `PI_BIN` / `PATH` | Pi resolution precedence                                                                                                                               |
| Pi startup options                | `--continue`, `--resume`, `--session`, `--no-session`, `--session-dir`, `--name`, `--provider`, `--model`, `--thinking`, and `--api-key` are forwarded |

## RPC and browser protocol

`src/lib/client/protocol.ts` is the shared protocol type/validation source for browser frames. `src/server/websocket.ts` parses and validates one JSON WebSocket frame at a time, owns `/ws` connection lifecycle, and leaves other upgrades (such as Vite HMR) alone.

`src/server/rpc-broker.ts` is transport-independent and owns:

- browser command validation/mapping and generated Pi request IDs;
- response correlation back to the requesting tab;
- broadcast of Pi events, extension UI requests, and server statuses;
- cached snapshots for reconnecting tabs;
- internal SDK-backed `get_session_list` handling;
- session-list refresh after session mutations and explicit Pi restart.

Browser frames use `kind` values including `command`, `dialog_response`, and `ping`. Server frames include `response`, `event`, `events` (coalesced events), `snapshot`, `extension_ui_request`, `server_status`, and `pong`. Session-list enumeration is internal and is never forwarded to Pi.

Pi stdout is strict LF JSONL: decode UTF-8 incrementally, split only on `\n`, remove one trailing `\r`, ignore empty records, and JSON-parse each remaining record. Do not replace this with Node `readline`, which has incompatible Unicode line-separator behavior. Commands written to Pi are exactly one `JSON.stringify(command) + "\n"` record.

`src/server/event-batcher.ts` coalesces stream-heavy updates on a 16 ms timer. Cumulative `tool_execution_update` events replace older updates for the same tool call. Lifecycle/error/session/dialog events flush immediately.

## Client state and UI

The root layout creates one `AppState` per request/browser app and provides it through the typed Svelte context in `src/lib/state/app-context.svelte.ts`. Do not introduce a mutable module-level state singleton. `AppState` in `app-state.svelte.ts` contains connection, snapshots, conversation, queue, extension UI, compaction, Pi availability, session transition, editor, and layout state.

`src/lib/client/ws-client.ts` starts the browser-only socket in `onMount`, performs bootstrap requests (`get_state`, `get_messages`, `get_commands`, `get_session_stats`, `get_session_list`), reconnects with bounded exponential backoff/jitter, and refreshes state after terminal/session events.

The main composition is `src/lib/components/AppShell.svelte`:

- header/project/session/actions;
- `Conversation` with structured message cards and tool cards;
- extension widgets above/below the editor;
- queue panel;
- multiline editor with Send/Steer, Follow-up, and Abort;
- footer metrics/statuses;
- command, model, thinking, compaction, extension, recovery, session, tree, mobile, and toast overlays.

Conversation reduction is pure code in `src/lib/state/event-reducer.ts`. It hydrates durable history, keeps thinking separate from visible assistant text, upserts streaming assistant messages and tool cards by stable IDs, and preserves edit diffs. Footer formatting is pure code in `src/lib/state/footer.ts`; absent Pi metrics display as `—`, not fabricated zeroes.

Use Svelte 5 conventions already established in the repository: `$state`, `$derived`, `$props`, `onclick`, and snippets. New components should not use legacy `export let`, `on:...`, or slot APIs. Keep the UI Tailwind-only with the default palette and the system monospace stack; Pi theme JSON is intentionally out of scope.

## Source map

```text
src/
  routes/+page.svelte             Main route; renders AppShell
  routes/+layout.svelte           Imports global CSS and creates AppState
  routes/layout.css               Tailwind imports, plugins, global typography/layout
  lib/client/protocol.ts          Shared JSON/WebSocket types and frame validation
  lib/client/ws-client.ts         Browser socket, bootstrap, reconnect, request promises
  lib/state/app-state.svelte.ts  Reactive client state and frame application
  lib/state/event-reducer.ts     Pure conversation/event reduction
  lib/state/footer.ts             Pure footer/stat derivation
  lib/components/                UI shell, cards, editor, drawers, dialogs, core controls
  server/cli.ts                   CLI and Pi argument parsing
  server/pi-binary.ts             Pi executable resolution
  server/pi-process.ts            Child process and strict JSONL transport
  server/pi-lifecycle.ts          Startup options and process construction
  server/pi-supervisor.ts         Explicit restart lifecycle
  server/rpc-broker.ts            RPC correlation, broadcast, snapshots, session adapter
  server/websocket.ts             /ws upgrade and connection handling
  server/session-list.ts          SDK SessionManager list adapter
  server/event-batcher.ts         Stream event coalescing
  server/main.ts                  Shared HTTP/runtime factories
  server/entry.ts                 Production CLI executable
```

Tests live beside the implementation as `*.spec.ts` and `*.svelte.spec.ts`; browser E2E tests are `*.e2e.ts` under `src/routes` and demo fixtures.

## Verification commands

```sh
npm install
npm run dev                 # Vite UI/runtime on port 5100; requires Pi
npm run build               # Vite/adapter build plus server TypeScript emit
npm start                   # Run built production executable
npm run check               # svelte-check and TypeScript diagnostics
npm run lint                # Prettier check plus ESLint
npm run test:unit           # Vitest client/server unit tests
npm run test:e2e            # Playwright E2E; installs browsers first
npm run test                # Unit run followed by E2E
npm run precommit           # build, check, lint, and all tests
```

The deterministic E2E suite uses a fake in-browser WebSocket/Pi transport and does not require provider credentials. Unit tests mock the Pi stdin/stdout boundary. Running the production executable requires an installed/executable Pi binary unless a test double is supplied.

## Scope boundaries

Do not accidentally expand v1 into any of the following: Pi theme loading, terminal emulation, file `@` completion, image attachments, user bash mode, Pi export/share/login UI, multiple active Pi subprocesses, multiple OS-user configurations, or in-place session-tree navigation. Pi RPC supports tree inspection and fork/clone actions, but not `AgentSession.navigateTree()`.

Queue state comes from Pi `queue_update`. There is no precise queue-item removal RPC; the UI must retain the documented conservative copy-back/abort behavior and must not claim arbitrary per-item cancellation.

The detailed specification requires extension-dialog ownership in a shared-tab setup. The current broker forwards extension requests to connected tabs, while the client dialog state is a simple queue; treat ownership/promotion as an area to preserve or complete deliberately rather than assuming it is already solved.

When behavior is ambiguous, prefer the documented contract in `SPECIFICATION.md`, then the existing tested protocol and module boundaries, and finally the current UI implementation. Update this file only when the architecture or contributor-relevant behavior changes.
