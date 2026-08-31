# Web Agent

Web Agent is a local, mobile-responsive React interface for the Pi coding-agent SDK. Web Agent 2.0 embeds one long-lived `AgentSessionRuntime` directly in its Bun server; it does not launch or require the Pi CLI.

> **Security:** Web Agent controls an agent with local filesystem and shell access. It defaults to loopback, but `--host`/`--bind` can expose it on another interface. Only do this intentionally. The read-only Changes view can display tracked and untracked file contents, including credentials.

## Install and run

Install the standalone binary:

```sh
curl -fsSL https://raw.githubusercontent.com/mjswensen/web-agent/main/install.sh | sh
web-agent
```

Required standalone targets are Linux x64, Linux arm64, and macOS arm64. A standalone binary is one file and requires no Pi, Node.js, Bun, `node_modules`, or adjacent browser assets. Provider credentials and network access are still required for model calls. An operating-system shell is required by shell tools; Git is optional and used only by Git-specific features.

The Bun/npm package remains supported and requires Bun 1.3.14 or newer:

```sh
bun add --global @mjswensen/web-agent
web-agent
```

The server prints its final URL, normally `http://127.0.0.1:3000`. It opens a browser only with `--open`; an occupied port falls forward to the next available port.

## Provider and Pi data compatibility

Web Agent continues to use Pi's existing `~/.pi/agent/` files, including `auth.json`, `models.json`, `settings.json`, project trust decisions, and JSONL sessions. Provider environment variables and `--api-key` are also supported. If no authenticated model exists, sessions and settings remain available while Send is disabled with setup guidance.

Direct user/project context files, skills, and prompt templates are loaded subject to saved project trust. Untrusted project resources are ignored with a startup diagnostic. External extensions, extension UI, themes, Pi package resources, package installation/update, image input, telemetry, update checks, and automatic model-catalog refreshes are intentionally unsupported. `PI_OFFLINE` remains honored.

## CLI reference

| Option                                  | Description                                               |
| --------------------------------------- | --------------------------------------------------------- |
| `--port <number>`                       | Requested port; defaults to `PI_WEB_PORT` or `3000`.      |
| `--host <address>` / `--bind <address>` | Listen address; defaults to `127.0.0.1`.                  |
| `--open`                                | Open the final URL.                                       |
| `--continue`, `-c`                      | Continue the latest launch-project session.               |
| `--session <path-or-id>`                | Open a session belonging to the launch project.           |
| `--no-session`                          | Disable session persistence.                              |
| `--session-dir <path>`                  | Use an explicit session directory.                        |
| `--name <name>`                         | Name the initial session.                                 |
| `--provider <provider>`                 | Select a provider.                                        |
| `--model <model>`                       | Select a model, optionally as `provider/model`.           |
| `--thinking <level>`                    | Select the thinking level.                                |
| `--api-key <key>`                       | Set a runtime-only key; requires an unambiguous provider. |

Web Agent 2.0 removed `--pi`, `PI_BIN`, `--resume`, and `-r` because no external Pi executable is used.

## Interface

- **Send** submits while idle; during active work it becomes **Steer**. Command+Enter invokes it on macOS.
- **Follow-up** queues a message after the current run settles; **Abort** stops active work.
- Header controls expose commands, models, thinking, compaction, launch-project sessions, the read-only tree, and Git Changes.
- All connected tabs share the runtime, active session, conversation, queue, snapshots, and transitions.
- Session new/switch/fork/clone operations are serialized to prevent cross-tab races.

## Development

```sh
bun install --frozen-lockfile
bun run build
bun start
```

Compile all supported standalone binaries into `dist/` with:

```sh
bun run build:binaries
```

Useful checks:

```sh
bun run check
bun run lint
bun run test:unit
bun run test:e2e
bun run precommit
```

The browser is built and encoded into `src/server/embedded-assets.generated.ts`; release executables serve all assets from memory through the existing `Bun.serve` instance. Tests use fake transports/providers and require no real credentials.

## License

[MIT](./LICENSE). See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for bundled dependency notices.
