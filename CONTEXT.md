# Web Agent project context

Web Agent 2.0 is a standalone Bun package and strict single-file release executable. A React browser UI connects to one `Bun.serve` server and one in-process `@earendil-works/pi-coding-agent` `AgentSessionRuntime`. Every tab shares that runtime, session, conversation, queue, and transitions. There is no Pi child process or JSONL stdio transport.

## Runtime architecture

```text
Browser tab(s) -- WebSocket /ws --> one Bun.serve server
                                      |-- RpcBroker + snapshots/event batching
                                      |       `-- SdkTransport
                                      |               `-- one AgentSessionRuntime
                                      |-- read-only Git provider
                                      `-- embedded client assets
```

- `src/server/sdk-runtime.ts` creates the shared `ModelRuntime`, restricted resources/services, launch-project session target, trust diagnostics, shutdown flushing, and exactly one runtime.
- `src/server/sdk-transport.ts` maps the retained RPC-shaped command surface onto public session/runtime APIs and emits compatible responses/events.
- `src/server/rpc-broker.ts` validates/mutates command envelopes, correlates browser requests, broadcasts events/snapshots, batches streams, serializes session transitions through the adapter, and owns internal session-list/Git commands.
- `src/server/main.ts` composes the runtime, adapter, broker, Git provider, and WebSocket hub.
- `src/server/entry.ts` owns the sole `Bun.serve` instance and serves `embedded-assets.generated.ts` from memory.

The SDK is pinned exactly at `0.82.1`. Only public APIs are used. Model catalog creation disables network refresh; `PI_OFFLINE` is honored. Runtime overrides disable install telemetry/provider attribution without rewriting settings.

## Resources, trust, and sessions

Existing `~/.pi/agent/auth.json`, `models.json`, `settings.json`, trust decisions, and JSONL sessions remain compatible. Settings writes for model/thinking/retry/compaction are flushed at shutdown. Direct user/project context, skills, and prompts load through the restricted SDK loader. Packages, extension discovery/UI, themes, image input, package installation/update, telemetry, and Pi update/catalog checks are disabled.

Saved trust decisions and `defaultProjectTrust` are honored. With `ask` and no saved decision, project resources are ignored and a host diagnostic is printed; Web Agent does not add trust UI.

Session listing/switching is restricted to the launch cwd. Legacy sessions without cwd are accepted only when found by the launch project's normal or explicit session directory. New/switch/fork/clone operations are mutually exclusive. Runtime session events are re-subscribed after replacement.

Availability has three states: `ready`, `unconfigured` (runtime works but no authenticated model), and `unavailable` (fatal post-start runtime failure). SDK initialization errors fail CLI startup. Unconfigured mode preserves session/settings access and disables Send.

## Browser and client

`src/lib/client/protocol.ts` is the shared frame validator. Browser IDs are preserved: command responses return only to their source tab while events and snapshots fan out. Prompt acknowledgement occurs at SDK preflight acceptance, before model completion. `EventBatcher` batches at about 16 ms and retains only the newest cumulative tool update per tool call.

`AppState` is app-scoped through React context. React functional components use hooks and Tailwind 4. Reducers are pure, snapshots authoritative, thinking is separate from assistant text, and rendered Markdown is sanitized. Extension dialogs/widgets/status and restart recovery UI were removed.

## Build and release

`bun run build`:

1. bundles/minifies React and Tailwind without release source maps;
2. runs `scripts/embed-client.ts` to encode every client output into a generated TypeScript manifest;
3. emits server ESM and package metadata.

Release compilation uses Bun's `--compile` against `build/server/server/entry.js`. Required standalone targets are Linux x64 and macOS arm64. The executable needs no Pi, Node.js, Bun, `node_modules`, or adjacent assets. Provider network/credentials remain intrinsic; an OS shell is required for shell tools and Git is optional for Git features.

## CLI

Loopback `127.0.0.1`, port `3000`/`PI_WEB_PORT`, fallback ports, and opt-in `--open` remain. Typed SDK options are `--continue`, `--session`, `--no-session`, `--session-dir`, `--name`, `--provider`, `--model`, `--thinking`, and `--api-key`. `--pi`, `PI_BIN`, and `--resume` were removed.

## Verification

```sh
bun run check
bun run lint
bun run test:unit
bun run test:e2e
bun run build
```

Standalone smoke tests should run from an empty directory with clean `HOME`, restricted `PATH`, no adjacent dependencies/assets, and `PI_OFFLINE=1`.
