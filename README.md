# Web Agent

Web Agent is a local, mobile-responsive browser interface for [Pi](https://pi.dev). It is a standalone Node.js package, not a Pi extension. One Web Agent server owns one long-lived `pi --mode rpc` child process and shares its active session with every connected browser tab.

> **Security:** Web Agent controls an agent with local filesystem and shell access. It intentionally listens on a loopback address only. Do not expose it through a reverse proxy, tunnel, or public network interface.

## Requirements

- Node.js 22.19 or newer
- A working Pi installation available on `PATH`, or an executable path supplied with `--pi` or `PI_BIN`

## Install and run

Install the package globally:

```sh
npm install --global web-agent
web-agent
```

Or run a checked-out repository:

```sh
npm install
npm run build
npm start
```

The server prints its final local URL, normally `http://127.0.0.1:3000`. It does **not** open a browser unless requested.

```sh
web-agent --port 4000 --open
```

If the requested port is already occupied, Web Agent chooses the next available local port and prints that URL.

### Pi resolution

Pi is selected in this order:

1. `--pi <path>`
2. `PI_BIN`
3. `pi` found on `PATH`

For example:

```sh
web-agent --pi "$HOME/.local/bin/pi"
PI_BIN=/opt/pi/bin/pi web-agent
```

If no executable Pi binary is found, Web Agent exits with instructions rather than starting a partially working server.

## CLI reference

| Option / environment variable           | Description                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `--port <number>`                       | Requested local HTTP port. Overrides `PI_WEB_PORT`. Default: `3000`.          |
| `PI_WEB_PORT`                           | Requested port when `--port` is omitted.                                      |
| `--host <address>` / `--bind <address>` | Loopback address. Default: `127.0.0.1`. Only loopback addresses are accepted. |
| `--open`                                | Open the selected URL using the operating system browser handler.             |
| `--pi <path>`                           | Explicit Pi executable.                                                       |
| `PI_BIN`                                | Fallback Pi executable when `--pi` is absent.                                 |

These Pi startup options are forwarded to the child, which always receives `--mode rpc`:

```text
--continue, -c      --resume, -r       --session <path-or-id>
--no-session        --session-dir <path>
--name <name>       --provider <provider>  --model <model>
--thinking <level>  --api-key <key>
```

Run `web-agent --help` for the concise command-line summary.

## Using the interface

- **Send** submits a prompt while Pi is idle. During an active run it becomes **Steer**.
- **Follow-up** queues a message for after Pi fully settles.
- **Abort** stops active work.
- Use the header controls (or the mobile **Menu**) for commands, models, thinking level, compaction, sessions, and the session tree.
- Tool calls stream output live. Expand completed tools to inspect arguments, output, and edit diffs.
- Thinking is kept separate from assistant text and is collapsed by default.
- All tabs see the same active session, conversation, queue, and session transitions.

Saved sessions are listed from Pi's `SessionManager` for the current project only. The session tree is intentionally view-only: Pi RPC supports tree inspection and fork/clone actions, but does not expose in-place tree navigation.

If Pi exits, the browser preserves the visible conversation and offers **Restart Pi**. Restarting creates one new child process while keeping the Web Agent server running.

## Development

```sh
npm install
npm run dev
```

`npm run dev` starts the Vite/Svelte development UI. For the full Node/Pi runtime, use `npm run build && npm start`.

Useful checks:

```sh
npm run check       # Svelte and TypeScript diagnostics
npm run lint        # Prettier and ESLint
npm run test:unit   # Vitest unit tests
npm run test:e2e    # Playwright browser tests
npm run precommit   # Build, checks, lint, unit tests, and E2E tests
```

The E2E suite uses a deterministic in-browser RPC transport and does not require provider credentials. Unit tests mock the Pi stdin/stdout boundary.

## Current v1 boundaries

Web Agent deliberately does not provide terminal emulation, Pi theme loading, public-network serving, file `@` completion, image attachments, user-bash mode, Pi sharing/export UI, or multiple concurrent active Pi sessions. See [`SPECIFICATION.md`](./SPECIFICATION.md) for the complete design and scope.

## License

[MIT](./LICENSE)
