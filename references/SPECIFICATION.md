# Web Agent — Design and Implementation Specification

## 1. Purpose

Build **Web Agent**, a local, mobile-responsive web interface for [Pi](https://pi.dev). It is a standalone npm package with a Node.js executable, not a Pi extension. It runs a SvelteKit server on a user-selected local port, launches one long-lived `pi --mode rpc` child process, and presents Pi's interactive workflow in a web-native UI.

The UI takes its general layout, terminology, flows, and interaction hierarchy from Pi's TUI:

1. startup/session context header;
2. scrollable conversation and tool activity;
3. widgets above/below the editor;
4. message editor and queue controls;
5. status/footer information.

It is **not** a terminal emulator and does not need pixel-for-pixel parity. Styling uses Tailwind's default visual language only. Pi theme loading and Pi-theme-to-CSS translation are explicitly out of scope.

## 2. Goals and non-goals

### 2.1 v1 goals

- Run locally on a supplied port, defaulting to `3000`.
- Be installable and runnable as a standalone npm package via `web-agent`.
- Use SvelteKit, Svelte 5, TypeScript, Tailwind CSS 4, and the Node adapter.
- Spawn and broker one long-lived `pi --mode rpc` subprocess.
- Stream assistant text, thinking, tool calls, tool output, retries, compaction, queue state, and errors live to all connected browser tabs.
- Support the core interactive Pi experience:
  - prompt, steer, follow-up, and abort;
  - streaming assistant text and thinking blocks;
  - tool call/result cards, collapsing, streaming tool output, and edit diffs;
  - model selection and thinking-level selection;
  - session list, new session, switch session, session naming, fork, and clone;
  - a view-only session tree with fork/clone/switch actions;
  - manual compaction and auto-compaction status;
  - command, prompt-template, and skill palette;
  - Pi RPC extension UI dialogs, notifications, status entries, widgets, title changes, and editor-text updates;
  - TUI-equivalent footer metrics where RPC provides them.
- Make the core layout mobile-responsive.
- Bind to a configurable listen address, defaulting to loopback.
- Include unit and end-to-end testing.
- Publish under the MIT license.

### 2.2 Explicit v1 non-goals

- Pi theme support or custom theme loading.
- Terminal emulation or exact terminal keybinding parity.
- File `@` reference search/completion.
- Image paste/drag-and-drop attachments.
- TUI `!` / `!!` user-bash mode.
- Pi's `/export`, `/share`, or login UI.
- In-place session-tree navigation (`AgentSession.navigateTree()` is not exposed by Pi RPC).
- Multiple simultaneous active Pi sessions or one subprocess per tab.
- Multiple OS-user Pi configurations.
- i18n and accessibility work beyond sensible semantic HTML.
- A logging/diagnostics subsystem, Pi upgrade strategy, or repository bootstrapping checklist.

Deferred items are listed in [Section 18](#18-deferred-work).

## 3. Technology choices

Use SvelteKit with Svelte 5, TypeScript, Tailwind CSS 4, and the Node adapter. Repository bootstrapping selects the compatible current dependencies and tooling.

Use SvelteKit as the single application server. The production Node server must own both SvelteKit request handling and the WebSocket upgrade endpoint; do not create a separate Hono/Express application or a second server process.

Use the current supported SvelteKit/adapter-node WebSocket integration. If the adapter's generated entry point does not expose a WebSocket hook directly, provide a thin custom Node entry point that creates the one HTTP server, installs the generated SvelteKit handler, and attaches the `/ws` upgrade handler to that same server. A small Node WebSocket dependency is acceptable for this adapter glue. This is still one SvelteKit-owned server process.

## 4. Architecture

```text
Browser tab A ──────── WebSocket /ws ─┐
Browser tab B ──────── WebSocket /ws ─┼─ Web Agent Node/SvelteKit server
Browser tab N ──────── WebSocket /ws ─┘       │
                                               ├─ serves SvelteKit client and HTTP routes
                                               ├─ maintains shared UI/session state
                                               ├─ lists session files via Pi SDK SessionManager
                                               └─ one JSONL stdin/stdout bridge
                                                          │
                                             one long-lived child process
                                                          │
                                                pi --mode rpc [flags]
                                                          │
                                      Pi session storage, credentials, extensions, skills, tools
```

### 4.1 One active Pi session

There is exactly one active session in the child process at a time. This matches Pi's TUI model.

- All connected browser tabs receive the same live state and events.
- A session switch, fork, clone, or new-session operation changes the active session for **all** tabs.
- Other saved sessions are browsable from the session drawer and can be switched into on demand.
- The server does **not** keep multiple Pi child processes or support two agent runs at once.

### 4.2 Why Pi RPC is the integration boundary

The server communicates with Pi through its documented JSONL RPC mode, not by creating an in-process `AgentSession`.

Run the child as:

```text
<resolved-pi-binary> --mode rpc [forwarded Pi options]
```

Pi RPC provides all live-agent operations and events required by v1, including prompt streaming, tool lifecycle events, model/thinking operations, compaction, session switch/fork/clone, session tree retrieval, command discovery, and extension UI requests.

The only SDK usage is server-side session-file enumeration via `SessionManager.list()` / `SessionManager.listAll()`. Pi RPC has no command for listing sessions. The server must never use the SDK to manipulate the child process's live `AgentSession`.

### 4.3 Process lifecycle

1. Parse Web Agent CLI options and environment variables.
2. Resolve the Pi executable.
3. Start the HTTP/WebSocket server.
4. Spawn the single `pi --mode rpc` child using the Web Agent process working directory as its `cwd`.
5. Attach strict-LF JSONL readers to the child's stdout and stderr readers for diagnostics/error handling.
6. On child readiness, query initial state and begin accepting browser commands.
7. On `SIGINT`, `SIGTERM`, or normal server shutdown:
   - stop accepting WebSocket upgrades;
   - notify connected clients that shutdown is occurring;
   - close WebSockets;
   - close the child's stdin and send a graceful termination signal;
   - wait for a bounded grace period, then force-kill only if needed.

The child must be started only once. Restarting it is an explicit recovery action after a crash; see [Section 16](#16-error-states-and-recovery).

## 5. Package and project layout

This is a fresh, standalone SvelteKit repository, not a Pi extension.

### 5.1 Suggested source structure

```text
src/
  app.html
  app.css                         # Tailwind import and global layout primitives
  lib/
    components/
      AppShell.svelte
      StartupHeader.svelte
      Conversation.svelte
      MessageCard.svelte
      AssistantMessage.svelte
      ThinkingBlock.svelte
      ToolCard.svelte
      DiffView.svelte
      Editor.svelte
      QueuePanel.svelte
      CommandPalette.svelte
      SessionDrawer.svelte
      SessionTreeDrawer.svelte
      ModelDialog.svelte
      ThinkingDialog.svelte
      CompactDialog.svelte
      ExtensionDialogHost.svelte
      Footer.svelte
      ToastHost.svelte
      WidgetRegion.svelte
    state/
      app-state.svelte.ts         # client-scoped Svelte 5 reactive state
      app-context.svelte.ts       # typed createContext helper
      event-reducer.ts
    client/
      ws-client.ts
      protocol.ts
      event-reducer.ts
      shortcuts.ts
  routes/
    +page.svelte                  # main interactive UI
    +layout.svelte
    api/health/+server.ts         # optional health endpoint
  server/
    cli.ts                        # CLI parsing, help, environment resolution
    pi-binary.ts                  # --pi / PI_BIN / PATH resolution
    pi-process.ts                 # spawn, strict JSONL parser, stdin writer
    rpc-broker.ts                 # command IDs, responses, event distribution
    websocket.ts                  # /ws upgrade/connection lifecycle
    session-list.ts               # SDK SessionManager list/listAll adapter
    state.ts                      # shared server state/snapshots
    main.ts                       # production Node/SvelteKit server entry
static/
  ...
tests/
  unit/
  e2e/
README.md
LICENSE
```

Exact filenames may vary, but preserve these module boundaries: process/RPC broker, WebSocket transport, server-side session listing, and client state reduction must not be merged into one opaque module.

## 6. CLI, environment, and startup semantics

### 6.1 Web Agent options

| Input                                   | Behavior                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `--port <number>`                       | Requested HTTP port. Overrides `PI_WEB_PORT`.                                       |
| `PI_WEB_PORT`                           | Requested HTTP port when `--port` is absent.                                        |
| no port input                           | Request port `3000`.                                                                |
| occupied requested port                 | Bind the first available port and print the selected URL.                           |
| `--open`                                | Open the selected URL in the default browser after startup. Default: do not open.   |
| `--host <address>` / `--bind <address>` | Listen address. Default: `127.0.0.1`; any address supported by Node.js is accepted. |
| `--pi <path>`                           | Explicit Pi executable path.                                                        |
| `PI_BIN`                                | Pi executable fallback when `--pi` is absent.                                       |

The server prints its final listening URL.

### 6.2 Pi executable resolution

Resolve in this exact order:

1. `--pi <path>`;
2. `PI_BIN`;
3. `pi` resolved from `PATH`.

Validate that the resolved item is executable before starting the child. If unavailable, exit with a clear message explaining that Pi must be installed and that `--pi` or `PI_BIN` can be used to choose its path.

### 6.3 Pi options forwarded to the child

Support and forward Pi's normal startup options:

| Web Agent input          | Child argument           |
| ------------------------ | ------------------------ |
| `--continue`, `-c`       | `--continue`             |
| `--resume`, `-r`         | `--resume`               |
| `--session <path-or-id>` | `--session <path-or-id>` |
| `--no-session`           | `--no-session`           |
| `--session-dir <path>`   | `--session-dir <path>`   |
| `--name <name>`          | `--name <name>`          |
| `--provider <provider>`  | `--provider <provider>`  |
| `--model <model>`        | `--model <model>`        |
| `--thinking <level>`     | `--thinking <level>`     |
| `--api-key <key>`        | `--api-key <key>`        |

Always add `--mode rpc`.

With no Pi session-selection argument, Pi starts a fresh persisted session. The UI opens its main conversation view with the session drawer available; it does not need a separate blocking startup picker.

The child's `cwd` is Web Agent's launch directory (`process.cwd()`). This is the project whose Pi configuration, tools, context files, and per-project sessions are in use.

## 7. Security model

Web Agent controls an agent with filesystem and shell access. It defaults to loopback, but operators may intentionally bind it to another interface. Do not enable permissive CORS, and document the security implications of non-loopback binding.

## 8. Pi RPC bridge

### 8.1 Strict JSONL framing

Pi RPC uses strict LF-delimited JSON records. The server parser must:

- decode stdout as UTF-8 with a streaming decoder;
- split only on `\n`;
- strip a single trailing `\r` from each record;
- not use Node `readline`, because it treats Unicode line separators as record delimiters;
- JSON-parse each non-empty record;
- preserve `id` on RPC responses for correlation.

Every command written to child stdin is one `JSON.stringify(command) + "\n"` record followed by a flush/write completion check.

### 8.2 Broker responsibilities

`rpc-broker.ts` owns:

- generated RPC request IDs;
- mapping a browser command request to a Pi RPC request;
- mapping Pi `response` records back to the originating browser request;
- broadcasting Pi event records to every connected browser;
- broadcasting extension UI requests and routing their response back to Pi;
- maintaining the latest Pi state snapshot, queue snapshot, extension status/widget state, and footer-stat snapshot;
- batching stream-heavy updates before broadcast;
- invalidating/reloading session-list snapshots after operations that create or switch sessions.

### 8.3 Streaming batch policy

Pi can emit per-token `message_update` events. Do not forward an individual WebSocket frame for every delta.

- Coalesce outgoing stream events on a ~16 ms timer (one animation-frame-scale interval).
- Coalesce text/thinking updates while preserving event order within a message/content block.
- For `tool_execution_update`, retain only the newest cumulative `partialResult` per `toolCallId` in a batch; Pi defines it as cumulative.
- Immediately flush errors, terminal lifecycle events (`agent_end`, `agent_settled`, `message_end`, `tool_execution_end`), session changes, and extension-dialog requests rather than waiting for the timer.

The client reducer must remain correct if it receives either a single delta or a coalesced delta payload.

## 9. Browser WebSocket protocol

Use one WebSocket connection per browser tab at `/ws`. All application frames are JSON objects with a required `kind` field.

One socket carries commands, command responses, Pi events, snapshots, and dialog responses. Do not create separate sockets for agent events and extension dialogs.

### 9.1 Client-to-server frames

#### `command`

```json
{
	"kind": "command",
	"id": "client-uuid",
	"command": "prompt",
	"params": {
		"message": "Explain this repository"
	}
}
```

The server validates the command and parameters, assigns or reuses a Pi RPC ID, forwards the corresponding Pi RPC command, and returns one `response` frame to the requesting tab.

Supported v1 commands and mappings:

| Browser command        | Pi RPC command         | Notes                                                                  |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `prompt`               | `prompt`               | When idle. During streaming, the UI should use `steer` or `follow_up`. |
| `steer`                | `steer`                | Queue a steering message.                                              |
| `follow_up`            | `follow_up`            | Queue a post-settlement message.                                       |
| `abort`                | `abort`                | Abort active agent work.                                               |
| `get_state`            | `get_state`            | Refresh state snapshot.                                                |
| `get_messages`         | `get_messages`         | Initial/history bootstrap.                                             |
| `get_commands`         | `get_commands`         | Command/skill palette source.                                          |
| `get_available_models` | `get_available_models` | Model picker source.                                                   |
| `set_model`            | `set_model`            | Requires provider/model ID.                                            |
| `cycle_model`          | `cycle_model`          | Optional shortcut action.                                              |
| `set_thinking_level`   | `set_thinking_level`   | Thinking picker action.                                                |
| `cycle_thinking_level` | `cycle_thinking_level` | Shortcut action.                                                       |
| `compact`              | `compact`              | Optional custom instructions.                                          |
| `set_auto_compaction`  | `set_auto_compaction`  | Optional settings control.                                             |
| `set_auto_retry`       | `set_auto_retry`       | Optional settings control.                                             |
| `abort_retry`          | `abort_retry`          | Recovery control.                                                      |
| `new_session`          | `new_session`          | Global active-session change.                                          |
| `switch_session`       | `switch_session`       | Global active-session change.                                          |
| `fork`                 | `fork`                 | Fork from a selected eligible user-message entry.                      |
| `clone`                | `clone`                | Clone the active branch.                                               |
| `get_fork_messages`    | `get_fork_messages`    | Source for fork actions.                                               |
| `get_entries`          | `get_entries`          | Tree/history updates and durable cursor sync.                          |
| `get_tree`             | `get_tree`             | View-only tree drawer.                                                 |
| `set_session_name`     | `set_session_name`     | Rename active session.                                                 |
| `get_session_stats`    | `get_session_stats`    | Footer refresh.                                                        |
| `export_html`          | `export_html`          | Not exposed in v1 UI; omit unless intentionally added later.           |

The server may expose an internal `get_session_list` command. It is **not** forwarded to Pi; it calls `SessionManager.list()` / `listAll()` server-side.

#### `dialog_response`

```json
{
	"kind": "dialog_response",
	"id": "extension-dialog-uuid",
	"value": "Allow"
}
```

This relays a Pi `extension_ui_response` to stdin. The response shape depends on the dialog method:

- `select`, `input`, `editor`: `value` or `cancelled: true`;
- `confirm`: `confirmed: true|false` or `cancelled: true`.

#### `ping`

```json
{ "kind": "ping", "id": "client-uuid" }
```

Use for application-level liveness when desired. Reply immediately with `pong`.

### 9.2 Server-to-client frames

#### `response`

```json
{
	"kind": "response",
	"id": "client-uuid",
	"command": "set_model",
	"success": true,
	"data": {}
}
```

On failure:

```json
{
	"kind": "response",
	"id": "client-uuid",
	"command": "set_model",
	"success": false,
	"error": "Model not found: example/unknown"
}
```

#### `event`

```json
{
	"kind": "event",
	"event": {
		"type": "message_update",
		"message": {},
		"assistantMessageEvent": {}
	}
}
```

This wraps Pi events (`agent_start`, `message_update`, `tool_execution_*`, `queue_update`, `compaction_*`, `auto_retry_*`, `agent_settled`, `extension_error`, and so on). A batched frame may contain an `events` array instead of one `event`.

#### `snapshot`

```json
{
	"kind": "snapshot",
	"snapshotType": "state",
	"data": {}
}
```

Use snapshots for `state`, `messages`, `session_list`, `footer_stats`, `queue`, extension `statuses`, and `widgets`. A snapshot is authoritative and lets a reconnecting client recover without replaying the full event history.

#### `extension_ui_request`

Forward Pi's request largely unchanged:

```json
{
	"kind": "extension_ui_request",
	"id": "extension-dialog-uuid",
	"method": "confirm",
	"title": "Dangerous command",
	"message": "Allow rm -rf?",
	"timeout": 10000
}
```

#### `server_status`

Use for connection/recovery conditions that are not Pi events, for example `pi_starting`, `pi_unavailable`, `pi_restarted`, or `server_shutting_down`.

### 9.3 Initial connection bootstrap

Immediately after a valid connection:

1. send current cached `state`, `queue`, extension status/widget, and footer snapshots if available;
2. send a `session_list` snapshot from the SDK session-list adapter;
3. the client requests `get_state`, `get_messages`, `get_commands`, and `get_session_stats` to establish a fresh authoritative view;
4. request `get_tree` lazily only when the tree drawer is opened;
5. request models lazily when opening the model picker, or eagerly after initial connection if the list is inexpensive.

On reconnection, repeat this bootstrap. The client must discard stale partial streaming state only after the new `get_messages`/state snapshot has been applied.

### 9.4 Dialog ownership in a shared-tab model

All tabs receive extension UI requests so their UI remains synchronized. However, Pi must receive exactly one answer.

- Associate each agent run with the WebSocket connection that submitted its initiating `prompt`, `steer`, or `follow_up` command.
- That originating connection is the **dialog owner** for extension dialogs emitted during that run. It shows actionable controls; all other tabs show a read-only “Awaiting response in another tab” modal/state.
- The first valid owner response resolves the pending dialog and disables it in every tab.
- If no initiating connection exists (for example, a dialog caused by session startup), designate the first currently connected tab as owner. If the owner disconnects, promote the oldest remaining connected tab and notify it.
- Pi's own dialog timeout remains the definitive backstop. The browser can display a countdown and proactively cancel at expiry.

## 10. Server-side session listing and session operations

### 10.1 Session list

Pi RPC does not expose saved-session enumeration. Use the Pi SDK in the server process:

```ts
SessionManager.list(cwd, sessionDir?)
SessionManager.listAll(sessionDir?)
```

Use the same `cwd` and optional `--session-dir` that are passed to the Pi child. Start with `SessionManager.list(cwd, sessionDir)` for the current project; expose all-project listing only if a future UX explicitly needs it.

Refresh and broadcast the current-project list:

- on WebSocket connect;
- after successful `new_session`, `switch_session`, `fork`, or `clone` RPC responses;
- after a session name update;
- after a successful reconnect/restart of the Pi child.

### 10.2 Session transitions

`new_session`, `switch_session`, `fork`, and `clone` are global transitions. While a transition is in progress:

- disable transition controls in all tabs;
- show a short global activity state;
- after the Pi response succeeds and is not cancelled, broadcast a `session_changed` server event;
- re-bootstrap `get_state`, `get_messages`, `get_entries`, `get_session_stats`, and command availability;
- clear transient streaming and extension UI state from the prior session;
- refresh the session list.

Respect Pi's `{ cancelled: true }` results. Treat them as a completed but no-op transition and restore controls without changing local session state.

### 10.3 View-only tree

`get_tree` is RPC-accessible. `AgentSession.navigateTree()` is not. Therefore the tree drawer is view-only with actions rather than in-place navigation.

- Render an expandable tree from `get_tree`.
- Highlight the active `leafId`.
- Display entry type, concise message summary, timestamps where useful, and labels/bookmarks where present.
- For eligible user-message nodes, provide **Fork from here** using `fork(entryId)`.
- Provide **Clone active branch** using `clone()` from the active-session controls.
- A session-list item can be opened with `switch_session(sessionPath)`.
- Do not show a “continue from this tree node” action, because it would falsely imply in-place tree navigation.

## 11. Frontend layout and components

### 11.1 Responsive shell

Desktop layout:

```text
┌──────────────────────────────────────────────────────────┐
│ StartupHeader: project, session, connection/actions       │
├──────────────────────────────────────────────────────────┤
│ Conversation                                             │
│   user / assistant / thinking / tool cards               │
│   extension widgets (above editor)                       │
├──────────────────────────────────────────────────────────┤
│ QueuePanel (when non-empty)                              │
│ Editor + send / follow-up / abort                         │
│ extension widgets (below editor)                         │
├──────────────────────────────────────────────────────────┤
│ Footer: cwd · session · tokens · cost · context · model  │
└──────────────────────────────────────────────────────────┘
```

On narrow/mobile screens:

- keep conversation full-width and vertically scrollable;
- make the header and footer compact and wrap-safe;
- replace persistent side/drawer panels with modal sheets/drawers;
- show session, tree, model, commands, and settings in full-width or bottom-sheet overlays;
- maintain a sticky editor and an accessible touch-size send/abort control;
- avoid assuming keyboard shortcuts are available.

### 11.2 Header

Show:

- Web Agent identity and connection status;
- current project working directory (truncate visually but retain full path in a tooltip/copy affordance);
- current session name or a generated/session-file summary;
- buttons for sessions, tree, new session, rename, model, and compact.

### 11.3 Conversation rendering

Render messages as structured records, not by simply appending raw HTML. Use keyed `{#each}` blocks with stable Pi message/content/tool IDs so streaming updates preserve the correct DOM and local UI state. Sanitize Markdown before rendering any resulting HTML.

- **user messages:** visually distinct neutral/blue card;
- **assistant text:** Markdown rendered safely; allow code blocks and copy controls;
- **thinking blocks:** collapsed by default or user-toggleable; streamed thinking appends in real time; never merge thinking into visible assistant text;
- **tool calls/results:** grouped beneath the assistant turn that created them;
- **errors:** clear red error cards/toasts, retaining the raw server/Pi error text where safe;
- **compaction/retry:** system timeline cards, not assistant text.

Hydrate history from `get_messages` and update it from lifecycle events. Deduplicate `message_end`/`agent_end` history against provisional streamed objects by Pi message IDs/content indices/tool call IDs.

### 11.4 Tool cards

Each tool call has one card with:

- tool label/name and concise argument summary;
- pending/success/error state and spinner while pending;
- collapse/expand control;
- streaming cumulative output for `tool_execution_update`;
- final result output and error indication from `tool_execution_end`;
- safe whitespace-preserving output rendering for shell/file results;
- copy control for long output where appropriate.

Use Tailwind visual states rather than Pi theme data:

| State          | Suggested Tailwind direction           |
| -------------- | -------------------------------------- |
| pending        | amber/yellow subdued background/border |
| success        | green subdued background/border        |
| error          | red subdued background/border          |
| default output | slate/gray monospace block             |

#### Edit diffs

For `edit` results, consume Pi's result `details.diff` or `details.patch` where available. Render a unified diff view:

- added lines: green tint;
- removed lines: red tint;
- unchanged/context lines: muted slate;
- preserve monospace spacing and line content;
- collapse large diffs by default with a clear expand control.

### 11.5 Extension UI rendering

Map the Pi RPC extension UI protocol as follows:

| Pi method         | Browser behavior                                   |
| ----------------- | -------------------------------------------------- |
| `select`          | modal/list picker with options and cancel          |
| `confirm`         | confirmation modal with confirm/cancel             |
| `input`           | single-line input modal                            |
| `editor`          | multi-line textarea modal prefilled from `prefill` |
| `notify`          | info/warning/error toast                           |
| `setStatus`       | keyed status item in footer/status area            |
| `setWidget`       | keyed widget region above or below editor          |
| `setTitle`        | update `document.title`                            |
| `set_editor_text` | replace current editor text                        |

Only one Pi blocking dialog should normally exist because Pi awaits its answer. The dialog host must still safely handle a queue and render only the active request.

## 12. Editor, command palette, queue, and shortcuts

### 12.1 Editor behavior

Use a multi-line textarea and a persistent, touch-sized **Send** button. `Enter` always inserts a newline; submission must not depend on an on-screen keyboard's enter-key behavior.

| Input                                    | Behavior                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Send button while idle                   | submit `prompt`                                                                |
| Send button while the agent is streaming | submit `steer`; label it **Steer** to make the changed delivery behavior clear |
| explicit **Queue follow-up** control     | submit `follow_up` while streaming                                             |
| `Enter` / `Shift+Enter`                  | insert a newline                                                               |
| abort button                             | submit `abort` while the agent is active                                       |
| `/` at the start of input                | open/filter command palette                                                    |

Disable send controls for blank input or while disconnected, retain the draft after a rejected request, and give Send, Steer, Queue follow-up, and Abort controls a minimum 44-by-44 CSS-pixel touch target. Do not implement file references, image attachments, or user bash mode in v1.

### 12.2 Command palette

Fetch available extension commands, prompt templates, and skills through `get_commands`.

- Opening with `/` filters by name and description.
- Selecting an entry inserts or submits its canonical `/name` form.
- Submitting a command is still a normal Pi `prompt` request; Pi expands skills/templates and executes extension commands.
- Built-in TUI-only commands must not be synthesized, because they are not available in RPC mode.

### 12.3 Queue panel

Use Pi `queue_update` as the source of truth for pending steering and follow-up messages.

- Display a compact queue chip whenever either queue is non-empty.
- Clicking the chip opens a panel listing pending steering and follow-up text separately.
- Use clear labels that explain delivery timing:
  - steering: after the current assistant turn/tool calls;
  - follow-up: after the agent fully settles.
- Per-message cancellation/retrieval is a UI requirement. Because Pi RPC exposes queue state but no dedicated queue-item removal operation, implement cancellation/retrieval by providing a conservative UI behavior: user can copy a queued message back into the editor and abort the current run, which causes Pi to restore queued messages to the editor according to Pi behavior. Do **not** claim a precise per-item RPC cancellation capability that Pi does not expose.

### 12.4 Keyboard shortcuts

Mirror TUI shortcuts when they are safe in browsers; always provide clickable alternatives.

| Shortcut    | Web action                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl+L`    | open model selector; prevent browser address-bar focus only while application focus is active and browser permits it                      |
| `Shift+Tab` | cycle thinking level                                                                                                                      |
| `Ctrl+O`    | collapse/expand tool outputs                                                                                                              |
| `Ctrl+T`    | collapse/expand thinking blocks                                                                                                           |
| `Escape`    | close topmost modal/palette; if no overlay and agent active, abort after an intentional confirmation or a clearly documented second press |
| `Ctrl+X`    | copy last assistant message where browser permissions allow                                                                               |

Do not intercept shortcuts in editable controls unless the UX clearly requires it. Mobile uses visible controls instead.

## 13. Model, thinking, compaction, and footer

### 13.1 Model and thinking controls

- Model dialog fetches `get_available_models`, groups/searches by provider, and calls `set_model(provider, modelId)`.
- Thinking dialog presents only levels usable by the current model where that metadata is available; `set_thinking_level` failures are surfaced as toasts and leave UI state unchanged.
- `Shift+Tab` calls `cycle_thinking_level`.
- Use state snapshots/events to reconcile model or thinking changes made by any tab.

### 13.2 Compaction

- Provide a manual compact action invoking `compact`, optionally with custom instructions.
- Display `compaction_start` / `compaction_end` timeline status, including reason, success/failure, summary metadata, and whether a retry will follow.
- Show auto-compaction enabled/disabled state from `get_state`.

### 13.3 Footer

Display the fields Pi can supply:

- working directory;
- session name;
- current model;
- thinking level;
- total input/output/cache-read/cache-write tokens;
- total cost;
- current context usage percentage (and tokens/context window when available);
- extension statuses from `setStatus`.

Refresh footer state:

- after initial bootstrap;
- after `agent_end` and `agent_settled`;
- after a state/model/thinking/session transition;
- after an explicit `get_state` or `get_session_stats` request;
- after compaction completes.

Show unavailable values as `—`, not fabricated zeroes.

## 14. Client state model and Svelte conventions

Use focused state areas and pure reducers rather than a monolithic page component. Implement client state in Svelte 5 runes mode: a client-scoped `AppState` class in a `.svelte.ts` module owns the reactive state, and the root layout provides it through a typed `createContext` helper. Do not put mutable application state in a module-level singleton, which can leak across SvelteKit SSR requests.

| State area     | Responsibility                                                                               |
| -------------- | -------------------------------------------------------------------------------------------- |
| `connection`   | socket state, reconnect attempt, server status, protocol request correlation                 |
| `session`      | active state, session list, tree, messages/entries cursor, transitions                       |
| `conversation` | canonical messages, provisional streaming blocks, tool execution state, collapse preferences |
| `queue`        | latest steering/follow-up arrays from `queue_update`                                         |
| `commands`     | available commands and palette query/open state                                              |
| `extension-ui` | pending dialogs, dialog ownership, toasts, widgets, statuses, document title                 |
| `footer`       | stats and derived display strings                                                            |
| `layout`       | open drawers/modals, mobile sheet state, global collapse toggles                             |

- Use `$state` only for values that drive rendered output, and `$derived`/`$derived.by` for values computed from that state. Do not use `$effect` to derive or synchronize application state.
- Use `$effect` only for unavoidable external synchronization. Start the browser WebSocket in `onMount` with cleanup, and keep SSR's initial UI safe without `window`, `document`, or WebSocket access.
- Components use `$props`, `onclick` event attributes, and snippets where composition is needed; do not use legacy `export let`, `on:...`, or slot APIs in new components.
- Keep event reduction and protocol transforms as pure TypeScript functions. The event reducer must be idempotent where possible and tolerate a reconnect snapshot arriving after partial live events.

## 15. Tailwind styling direction

No Pi theme JSON is loaded or interpreted.

Use Tailwind's default palette, a light default presentation, and a restrained coding-tool aesthetic:

- page background: `slate-50`/`slate-100`, with `slate-900` text;
- panels: white or `slate-50` surfaces with `slate-200` borders;
- primary actions/model selection: blue/indigo;
- user messages: muted blue/slate card;
- assistant text: neutral light surface;
- thinking: subtle violet/slate, visually secondary;
- tool pending/success/error: light amber/green/red tints respectively;
- markdown code and tool output: `slate-100` inset panels with dark readable text;
- focus rings and buttons: visible default Tailwind focus treatment.

Set the application's default font stack to the system monospace family (for example, `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`) to retain a subtle TUI feel. The editor border should vary by thinking level using fixed Tailwind color classes (for example gray, cyan, blue, violet, fuchsia), echoing the TUI concept without reading Pi theme tokens.

## 16. Error states and recovery

### 16.1 Pi child process crash or exit

When the child exits unexpectedly:

- broadcast `server_status: pi_unavailable` to all tabs;
- disable prompt/session mutation controls;
- preserve visible conversation state rather than blanking it;
- display the exit code/signal and a clear recovery panel;
- offer a **Restart Pi** action that starts a new long-lived child with the original launch arguments;
- on success, broadcast `pi_restarted`, re-bootstrap state/messages/session list, and re-enable controls;
- do not silently restart in a tight loop.

### 16.2 WebSocket loss and reconnect

On WebSocket close:

- mark the UI disconnected and disable controls that require a live server;
- retry automatically with bounded exponential backoff and jitter;
- stop retrying when the page unloads or server explicitly reports shutdown;
- after reconnect, repeat the full bootstrap sequence;
- display a non-blocking reconnect indicator and a manual retry action.

### 16.3 RPC command rejection

When Pi responds with `success: false`:

- show an error toast containing the Pi error message;
- roll back optimistic UI state, or avoid optimism for destructive/session-transition actions;
- preserve editor text on prompt rejection;
- never treat an RPC response as a successful state change until confirmed by Pi response/snapshot.

### 16.4 Protocol and parse errors

- Invalid browser frames receive a structured `response` failure when an ID is available; do not forward them to Pi.
- Invalid child JSONL records or unexpected child stdout produce a visible Pi-unavailable/protocol error state and must not crash the HTTP server.
- Handle malformed message data defensively in the client reducer: preserve the rest of the UI and show an error card/toast.

### 16.5 Extension dialog failures

- If an owner tab disconnects while holding a dialog, promote another tab as described in [Section 9.4](#94-dialog-ownership-in-a-shared-tab-model).
- If no tab remains, allow Pi's timeout behavior to resolve the request.
- A cancelled/expired dialog must send the matching `extension_ui_response` cancellation when possible.

## 17. Testing strategy

Only unit and end-to-end testing are required for v1.

### 17.1 Unit tests

Use a current Node-compatible test runner (Vitest is recommended for a SvelteKit/Vite repository). Unit-test at least:

- strict LF-only JSONL reader, including chunk boundaries, CRLF, Unicode line separators inside JSON strings, invalid JSON, and final-buffer handling;
- Pi binary resolution precedence: `--pi`, `PI_BIN`, then `PATH`;
- CLI port and host forwarding and forwarding of Pi arguments;
- RPC ID correlation and response routing;
- 16 ms batching/coalescing behavior, especially cumulative `tool_execution_update` replacement;
- server-side session-list adapter argument handling;
- WebSocket frame validation and command-to-RPC mappings;
- extension-dialog ownership/promotion rules;
- client event reducer behavior for streamed text, thinking, tools, completion, duplicate events, snapshots, and reconnect reset;
- footer derived values and unavailable stats;
- queue presentation behavior and its explicitly limited cancellation semantics.

Mock the Pi child process at the stdin/stdout boundary. Do not require real provider credentials for unit tests.

### 17.2 End-to-end tests

For v1, keep browser E2E coverage to deterministic happy paths. Use Playwright or an equivalent browser E2E framework against a fake Pi RPC executable/process that implements only the protocol needed for these flows:

1. the server starts, reports its final URL, and loads the main UI;
2. entering a prompt and pressing **Send** submits it, and streamed assistant text appears incrementally;
3. while streaming, **Steer** and **Queue follow-up** send the corresponding successful RPC commands;
4. a successful tool lifecycle renders pending/output/completion cards, including an edit diff;
5. model/thinking selection and session switching issue successful RPC commands and update the view;
6. at a narrow viewport, the visible Send control remains usable and the session drawer opens as a sheet.

Do not add E2E coverage for rejected requests, multi-tab dialog ownership, reconnects, child crashes, or other recovery/error paths in v1; those remain unit-tested where applicable.

A small optional smoke test using a real installed Pi binary may be run locally, but it must not be required in CI or require model-provider credentials.

## 18. Deferred work

Potential future work, deliberately excluded from v1:

- file `@` completion and project file browser;
- image attachments, clipboard image paste, and drag/drop;
- user bash (`!`/`!!`) controls;
- Pi HTML export and sharing UI;
- richer session operations and in-place tree navigation if Pi adds RPC support;
- multiple active session subprocesses or per-tab active sessions;
- a logging/diagnostic download panel;
- custom themes and consuming Pi theme JSON;
- i18n and dedicated accessibility effort;
- Pi binary update management;

## 19. Implementation sequence

Implement in vertical slices to keep the agent bridge testable:

1. [x] Initialize SvelteKit + adapter-node + Tailwind + TypeScript project and build/start scripts.
2. [x] Implement CLI parsing, loopback security defaults, configurable host binding, Pi resolution, child lifecycle, and strict JSONL bridge with unit tests.
3. [x] Implement `/ws`, browser protocol validation, RPC correlation, broadcast state, and the client-scoped connection state.
4. [x] Implement main shell, bootstrap/reconnect, basic prompt streaming, abort, and conversation reducer.
5. [x] Add tool cards, thinking blocks, batching, queue display, footer stats, and collapse controls.
6. [x] Add commands palette, model/thinking controls, compaction UI, and extension UI host.
7. [x] Add session SDK list, session drawer, switch/new/rename/fork/clone flows, and view-only tree.
8. [x] Add mobile responsive refinement, recovery states, and happy-path E2E coverage.
9. [x] Finish README usage/install/security documentation and MIT license file.

## 20. Verification checklist

Before declaring v1 complete, manually verify:

- `web-agent --port 3000` binds locally, does not open a browser, and prints the URL.
- `web-agent --open` opens the selected URL.
- occupied port selection falls forward to a free port and reports it.
- `--pi`, `PI_BIN`, and PATH resolution work in priority order.
- a missing Pi executable fails with useful instructions.
- a prompt streams text, thinking, tools, and final state without browser UI stalls.
- prompt submission while streaming sends steering; explicit follow-up waits for settlement.
- abort stops the active run and restores accurate queue/UI state.
- models, thinking levels, stats, cost, and context usage reflect Pi state.
- current-project session list is shown; new/switch/name/fork/clone work globally across two open tabs.
- tree displays branches and labels but does not imply unavailable in-place navigation.
- extension dialogs and fire-and-forget extension UI render correctly.
- tool output can collapse; edit results have readable added/removed/context diff styling.
- disconnect, child exit, and restart flows are comprehensible and recover without restarting the web server.
- narrow/mobile viewport retains a usable conversation, editor, drawers, and critical actions.
