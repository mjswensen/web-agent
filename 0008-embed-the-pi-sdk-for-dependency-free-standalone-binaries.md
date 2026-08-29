---
id: 8
created: 2026-08-29
---

# Embed the Pi SDK for dependency-free standalone binaries

## Objective

Replace the long-lived external `pi --mode rpc` subprocess with
`@earendil-works/pi-coding-agent` running directly inside Web Agent's Bun process. Ship Web
Agent 2.0 as a strict single-file standalone executable that requires no Pi, Node.js, Bun,
or adjacent web assets at runtime.

“Dependency-free” means no Pi, Node.js, or Bun installation is required. Provider credentials
and network access are still intrinsic requirements. An operating-system shell is required for
shell tools, and Git remains an optional external dependency used only by Git-specific features.

## Target architecture

```text
Browser tab(s) -- WebSocket /ws --> one Bun.serve server
                                      |-- RpcBroker + snapshots/event batching
                                      |       `-- in-process SDK transport
                                      |               `-- one AgentSessionRuntime
                                      |-- read-only Git status provider
                                      `-- embedded client assets
```

Keep the existing RPC-shaped browser/server command and event contract during this migration.
Implement it with an in-process adapter over public SDK APIs; do not retain JSONL, stdio, a Pi
child process, a fallback subprocess mode, or a second runtime.

## Agreed product and compatibility boundaries

- Continue reading and writing Pi's existing `~/.pi/agent/` data.
- Preserve `auth.json`, `models.json`, `settings.json`, existing JSONL sessions, `AGENTS.md`
  context files, skills, and prompt templates.
- Preserve Pi's saved project-trust decisions and `defaultProjectTrust` behavior. At startup,
  load trusted project resources and ignore untrusted resources with a visible diagnostic; do
  not add a trust UI in this work.
- Disable all external extension discovery, including user extensions, project extensions, and
  extension packages. No repository-owned extensions are needed initially.
- Remove extension UI support rather than recreating its RPC dialog/widget/status bridge.
- Load skills and prompt templates only from direct user/project filesystem locations. Ignore
  Pi package declarations and never install or update npm/Git packages.
- Do not load themes and do not add image input. Do not bundle Photon WASM, Pi themes, HTML
  export assets, or other unused Pi CLI/TUI assets.
- Preserve the current application feature surface. Do not add SDK-enabled tree navigation,
  image attachments, authentication UI, export, user bash, or other new product features.
- Preserve React. Correct stale repository instructions that describe the frontend as Svelte.
- Restrict session listing and switching to the launch project. Reject sessions with a different
  recorded cwd. A legacy session with no cwd may use the launch cwd only when discovered in the
  launch project's normal or explicitly configured session directory.
- Continue persisting model, thinking, retry, and compaction settings to the shared Pi settings
  file, and flush pending writes at graceful shutdown.
- Do not contact `pi.dev` for update checks, telemetry, or automatic model-catalog refreshes.
  Force Pi install telemetry/provider-attribution headers off for this embedded runtime without
  rewriting the user's settings. Continue honoring `PI_OFFLINE`.
- Keep the Bun/npm package supported; it may require Bun. The standalone release is the
  dependency-free distribution.

## Implementation plan

### 1. Gate the direction with a compiled SDK spike

Before the main rewrite:

1. Pin `@earendil-works/pi-coding-agent` to one exact, deliberately selected version and commit
   the lockfile. Do not use a caret range; SDK behavior becomes part of Web Agent's runtime.
2. In a temporary test/spike entry point, create and dispose a session with `ModelRuntime`,
   `SessionManager`, `createAgentSessionServices`, `createAgentSessionFromServices`, and
   `createAgentSessionRuntime`.
3. Compile it with `bun build --compile` and run it from an empty temporary directory with a
   clean `HOME`, no `node` or `pi` on `PATH`, no adjacent `node_modules`, and `PI_OFFLINE=1`.
4. Prove model enumeration and a deterministic fake-provider prompt/tool turn without real
   credentials or provider network access.
5. Confirm the selected SDK can be configured to skip extensions, package resources, themes,
   telemetry, and model-catalog network refreshes. Stop and resolve this at the SDK boundary
   rather than importing private Pi modules.

### 2. Add one in-process SDK runtime owner

Add a focused module such as `src/server/sdk-runtime.ts` that owns exactly one
`AgentSessionRuntime`, a shared `ModelRuntime`, the current SDK event subscription, startup
options, diagnostics, and disposal.

Follow the documented runtime factory pattern using `createAgentSessionServices`,
`createAgentSessionFromServices`, and `createAgentSessionRuntime`. Recreate cwd-bound services
when replacing a session, while enforcing the launch-cwd restriction. Re-subscribe to
`runtime.session` after every successful replacement.

Use a restricted resource-loader configuration/implementation that:

- loads settings, context files, direct skills, and direct prompt templates;
- honors project trust;
- loads no extensions, themes, or package resources;
- performs no package installation/update;
- reports ignored configured resources through host-owned diagnostics instead of stdout or
  process exit.

No authenticated model is not a startup failure. Expose three distinct states:

- `ready`: runtime initialized and a usable authenticated model exists;
- `unconfigured`: runtime initialized but no authenticated model is available;
- `unavailable`: an irrecoverable runtime failure occurred after startup.

SDK initialization failure is a fatal CLI startup error. After startup, only invariant/lifecycle
failures or session-replacement corruption mark the runtime unavailable. Provider errors, tool
failures, aborts, rejected commands, and compaction failures remain ordinary events/responses.

### 3. Put an SDK adapter behind the existing broker

Move the transport interface out of `rpc-broker.ts` and rename Pi-specific transport terms to
neutral agent terms. Implement `SdkTransport` against that interface. Retain the broker's
browser request correlation, tab fan-out, snapshots, event batching, Git commands, and command
validation.

`SdkTransport.send()` accepts the existing RPC-shaped command object, validates it, dispatches
through public SDK APIs, and emits the same response shape currently consumed by the broker:

```ts
{ type: 'response', id, command, success, data?, error? }
```

Emit SDK session events through the same record callback. Do not import Pi's private
`dist/modes/rpc/*` implementation. Port only the small command dispatcher onto public APIs.

Map the current command surface as follows:

- prompting: `session.prompt()` with `source: 'rpc'` and authoritative `preflightResult`, plus
  `session.steer()`, `session.followUp()`, and `session.abort()`;
- state/messages: session properties and `session.messages`;
- models: `session.modelRuntime.getAvailable()`, `session.setModel()`, and
  `session.cycleModel()`;
- thinking, retry, and compaction: the corresponding public session APIs;
- stats: `session.getSessionStats()`;
- replacement: `runtime.newSession()`, `runtime.switchSession()`, and `runtime.fork()`;
- clone: `runtime.fork(currentLeafId, { position: 'at' })`;
- entries/tree/fork messages: the current `SessionManager` and session APIs;
- commands: prompt templates and skills only;
- naming: `session.setSessionName()`.

A prompt response must be emitted when preflight accepts it, not when the model run finishes.
Preserve browser IDs and send command responses only to the originating tab.

Allow ordinary prompt/queue/abort/read commands according to SDK concurrency semantics, but
permit only one `new`, `switch`, `fork`, or `clone` operation at a time. Reject a competing
transition clearly and broadcast authoritative snapshots after the winning transition.

### 4. Replace CLI forwarding with typed SDK startup resolution

Refactor `src/server/cli.ts` so startup options are structured SDK inputs rather than a `piArgs`
array.

Remove:

- `--pi`;
- `PI_BIN`;
- `--resume` / `-r`;
- Pi executable resolution and `buildPiArguments()`.

Keep:

- `--continue`;
- `--session <path-or-id>`;
- `--no-session`;
- `--session-dir`;
- `--name`;
- `--provider`;
- `--model`;
- `--thinking`;
- `--api-key`.

Resolve sessions with public `SessionManager` APIs. Implement path/partial-ID resolution locally
using `SessionManager.list()` and `listAll()` while enforcing the launch-project boundary. Do not
copy/import private Pi CLI helpers.

Use `ModelRuntime.setRuntimeApiKey()` and `resolveCliModel()` for startup credentials/models.
Require `--api-key` to have an unambiguous provider supplied by `--provider` or a
provider-qualified `--model`; reject ambiguous keys rather than guessing.

Do not add browser login/OAuth setup. Initially support provider environment variables,
`--api-key`, and credentials already stored in `auth.json`. In the `unconfigured` state, keep
sessions/settings accessible, disable Send, and show setup guidance.

### 5. Remove subprocess and recovery architecture

Delete the production use and tests for:

- `src/server/pi-process.ts`;
- `src/server/pi-binary.ts`;
- `src/server/pi-lifecycle.ts`;
- `src/server/pi-supervisor.ts`.

Remove `restart_pi` from the browser protocol, the restart supervisor abstraction, recovery
panel/action, and all restart status handling. There is no fallback external-Pi flag.

Rename Web-Agent-owned status/state vocabulary from Pi-specific terms to agent-neutral terms,
including `agent_starting`, `agent_unavailable`, and `server_shutting_down`. RPC-shaped SDK
commands/events may retain their existing names.

If the runtime becomes irrecoverably unavailable after startup, keep the HTTP server and visible
browser conversation alive, mark the agent unavailable, and tell the user to restart Web Agent
manually.

On SIGINT/SIGTERM, abort active work immediately, wait briefly for idle, flush session/settings
writes, dispose the runtime, and exit. Do not process queued follow-ups during shutdown.

### 6. Remove unused extension support

Remove extension dialog/widget/status protocol frames, pending-dialog broker handling, client
state, and UI components. `get_commands` should continue to expose direct prompt templates and
skills, but never extensions.

If repository-owned extensions are needed in the future, design and statically import them as a
separate feature; do not retain dynamic extension machinery speculatively.

### 7. Embed all browser assets

The release server must not resolve client files from an adjacent `build/client` directory.
After the client build, generate/import an embedded asset manifest containing every required
HTML, JavaScript, CSS, icon, and other client output with its content type. Serve those bytes
from memory through the existing `Bun.serve` instance.

Use Bun embedded-file support if it is reliable across required targets; otherwise generate a
TypeScript byte/base64 manifest for deterministic bundling. Release binaries must be one file.
Omit browser/server source maps from release executables while retaining useful development
maps.

Keep the npm/Bun package path working with the same embedded-SDK architecture.

### 8. Update release automation

Ship as `2.0.0`.

Required standalone targets:

- macOS arm64;
- Linux x64.

macOS x64, Linux arm64, and Windows x64 are best-effort only. Retain them only if configuration
and validation remain trivial; they must not delay the migration. Run native smoke tests for
required platforms where practical rather than trusting cross-compilation alone.

Review the bundled dependency graph and add required third-party license notices.

### 9. Documentation and contributor-contract cleanup

Update `README.md`, `CONTEXT.md`, `AGENTS.md`, package metadata, CLI help, install messaging, and
release notes for the embedded architecture and dependency statement. Correct stale Svelte
instructions to React. Remove stale references to the absent `SPECIFICATION.md`; do not recreate
that document as part of this work.

Document that:

- standalone binaries need no Pi, Node.js, or Bun;
- provider credentials/network remain required for model calls;
- an OS shell is required for shell tools;
- Git is optional and only required by Git-specific features;
- existing Pi configuration/session locations remain in use;
- external extensions and package resources are intentionally unsupported;
- `--pi`, `PI_BIN`, and `--resume` were removed.

## Verification

Use injected fake runtimes/sessions/providers; never require real credentials.

### Focused unit and integration coverage

- CLI-to-SDK option parsing and model/session resolution.
- Rejection of ambiguous `--api-key` and cross-project sessions.
- Restricted resource discovery, trust behavior, and diagnostics for ignored extension/package
  configuration.
- Every retained command mapping and response shape.
- Prompt preflight acknowledgement timing and response ID preservation.
- SDK event forwarding, batching, snapshots, and malformed-event resilience.
- Event re-subscription after new/switch/fork/clone.
- Transition locking under simultaneous tabs.
- Multi-tab broadcast semantics and responses only to the initiating tab.
- Reconnect/bootstrap during and after streaming.
- Ready, unconfigured, and unavailable state behavior.
- Graceful abort/dispose/settings flush on shutdown.
- Session fixtures covering current, legacy-cwd, continue, switch, fork, and clone behavior.
- Git-unavailable behavior without preventing server startup.

### Standalone release smoke test

Run each required executable from an empty temporary directory with a clean `HOME`, restricted
`PATH`, no Pi/Node/Bun, no adjacent `node_modules` or web assets, and `PI_OFFLINE=1`. Verify:

1. server startup and embedded client delivery;
2. WebSocket bootstrap;
3. session/settings/model access in the unconfigured state;
4. a deterministic fake-provider prompt and tool turn;
5. persisted session continuation;
6. clean signal shutdown;
7. no attempted lookup of repository, `node_modules`, Pi CLI/TUI, theme, extension, package, or
   Photon files.

Run the repository's normal build, check, lint, unit, and deterministic E2E suites as applicable.

## Acceptance criteria

- [ ] Web Agent owns exactly one in-process `AgentSessionRuntime` and spawns no Pi child.
- [ ] Standalone macOS arm64 and Linux x64 binaries run without Pi, Node.js, Bun,
      `node_modules`, or adjacent client assets.
- [ ] The SDK dependency is pinned exactly and covered by compiled-binary smoke tests.
- [ ] Existing auth, models, settings, context files, direct skills/prompts, and same-project
      JSONL sessions continue to work from `~/.pi/agent/`.
- [ ] External extensions, extension UI, themes, Pi package resources, package installation,
      image processing, and Pi-specific network/telemetry behavior are disabled.
- [ ] The existing browser command/event contract and multi-tab semantics are preserved for all
      retained product features.
- [ ] `--pi`, `PI_BIN`, `--resume`, subprocess lifecycle code, and restart/recovery UI are gone.
- [ ] Cross-project session switches are rejected, and simultaneous session transitions cannot
      race.
- [ ] The UI distinguishes ready, unconfigured, and unavailable states.
- [ ] Provider/tool/command failures do not incorrectly poison the runtime.
- [ ] Shutdown aborts active work, flushes writes, and disposes the SDK runtime cleanly.
- [ ] Client assets are embedded in a strict single-file release executable.
- [ ] React remains the frontend; unrelated SDK-enabled features are not added.
- [ ] Documentation accurately describes the 2.0 architecture, CLI breaks, supported resources,
      release targets, and dependency boundaries.
