# Web Agent

Web Agent is a local, mobile-responsive React interface for the Pi coding-agent SDK. Web Agent 2.0 embeds one long-lived `AgentSessionRuntime` directly in its Bun server; it does not launch or require the Pi CLI.

> **Security:** Web Agent controls an agent with local filesystem and shell access. It defaults to loopback, but `--host`/`--bind` can expose it on another interface. Only do this intentionally. The read-only Changes view can display tracked and untracked file contents, including credentials. `--allow-terminal` additionally exposes an unrestricted interactive shell to every connected browser.

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

The Providers dialog supports Pi's provider-owned API-key and OAuth setup flows. Credentials entered there are persisted through Pi's normal `~/.pi/agent/auth.json` storage and are also available to the Pi CLI. Removing a saved credential does not remove environment variables, AWS profiles, Google application-default credentials, or other ambient authentication, so a provider may remain configured after logout. Authentication updates available models without requiring a Web Agent restart.

Browser credential entry is enabled by default only on loopback listeners. Use `--allow-web-auth` to opt in when binding to another interface, and only do so over a trusted connection: Web Agent does not provide TLS, so plain HTTP/WebSocket traffic is unencrypted. OAuth providers that redirect to a loopback callback may not work when the browser and Web Agent run on different machines; device-code and manual-code flows do not have that limitation.

## MCP servers

Web Agent embeds Pi **1.0.2** and its built-in MCP, codemode, and tool-search integrations. Open **MCP** in the header or **MCP servers** in the mobile menu to edit user-level `~/.pi/agent/mcp.json` as JSON. Add stdio servers with `command`, `args`, and `env`, or streamable HTTP servers with `url` and `headers`. For example:

```json
{
	"mcpServers": {
		"docs": { "url": "https://example.com/mcp", "exposure": "direct" }
	}
}
```

Use `enabled: false` to disable a server, remove its entry to delete it, and set `exposure` to `codemode` (default), `deferred`, `direct`, or `hidden`. `toolExposure` overrides individual tools. **Save & reconnect** persists the file and reloads resources without replacing the conversation; wait until the agent is idle. Concurrent stale edits are rejected. Existing trusted project `.pi/mcp.json` entries take precedence; project configuration is not edited by this dialog.

Only configure trusted servers: stdio executables and `!command` credential values run with your local user privileges, and remote servers receive tool data. Prefer `${TOKEN}` environment references over literal secrets. Configuration contents are sent only to the requesting tab, never broadcast or retained in reconnect snapshots. Browser access requires loopback or `--allow-web-auth`, just like provider credentials.

Pi validates advanced options during reload. **Check connections** shows Pi's server states, tool counts, and connection errors. If you have the Pi CLI installed separately, you can also use `pi mcp list` for connection diagnostics and `pi mcp login <server>` / `pi mcp logout <server>` for OAuth, then save in the dialog to reconnect. Browser-based MCP OAuth and MCP Apps are not supported. Ordinary MCP tool calls and results appear in the conversation like built-in tools.

## CLI reference

| Option                                  | Description                                               |
| --------------------------------------- | --------------------------------------------------------- |
| `--port <number>`                       | Requested port; defaults to `PI_WEB_PORT` or `3000`.      |
| `--host <address>` / `--bind <address>` | Listen address; defaults to `127.0.0.1`.                  |
| `--open`                                | Open the final URL.                                       |
| `--allow-web-auth`                      | Allow credential entry beyond loopback (unencrypted).     |
| `--allow-terminal`                      | Enable unrestricted per-browser PTY terminal access.      |
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
- Header controls expose commands, providers, MCP configuration, models, thinking, compaction, launch-project sessions, the read-only tree, and Git Changes.
- With `--allow-terminal`, Terminal opens a full-viewport xterm.js drawer backed by a Bun PTY in the launch project. Each tab owns its shell; hiding the drawer leaves it running, while disconnecting terminates it after 10 seconds.
- Assistant replies and reasoning traces render sanitized Markdown; reasoning remains visually separate from the reply.
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
