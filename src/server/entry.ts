#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };
import { CLI_HELP, parseCliArgs } from './cli.js';
import { createWebAgentRuntime } from './main.js';
import { findAvailablePort } from './port.js';

function localUrl(host: string, port: number): string {
	return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

function openBrowser(url: string): void {
	const command: { executable: string; args: string[] } =
		process.platform === 'darwin'
			? { executable: 'open', args: [url] }
			: process.platform === 'win32'
				? { executable: 'cmd', args: ['/c', 'start', '', url] }
				: { executable: 'xdg-open', args: [url] };
	const child = Bun.spawn({
		cmd: [command.executable, ...command.args],
		stdin: 'ignore',
		stdout: 'ignore',
		stderr: 'ignore'
	});
	child.unref();
}

if (process.argv.slice(2).some((argument) => argument === '--help' || argument === '-h')) {
	console.log(CLI_HELP);
	process.exit(0);
}

/** Resolve the directory containing pre-built client assets. */
function resolveClientDir(): string {
	const scriptDir = import.meta.dirname ?? __dirname;
	// Production: build/server/server/entry.js → ../../client → build/client/
	const prodCandidate = join(scriptDir, '..', '..', 'client');
	if (existsSync(join(prodCandidate, 'index.html'))) return prodCandidate;
	// Dev (bun src/server/entry.ts): src/server → ../../build/client
	return join(scriptDir, '..', '..', 'build', 'client');
}

try {
	const argv = process.argv.slice(2);
	const cli = parseCliArgs(argv);
	const port = findAvailablePort(cli.host, cli.port);

	const runtime = await createWebAgentRuntime({ argv, cwd: process.cwd() });
	const clientDir = resolveClientDir();

	const server = Bun.serve({
		hostname: cli.host,
		port,
		async fetch(request, server) {
			const url = new URL(request.url);

			// WebSocket upgrade
			if (url.pathname === '/ws') {
				const upgraded = server.upgrade(request, { data: undefined });
				if (!upgraded) {
					return new Response('WebSocket upgrade failed.', { status: 400 });
				}
				return undefined as unknown as Response;
			}

			// Serve static client assets with path traversal protection
			const resolved = join(clientDir, decodeURIComponent(url.pathname));
			if (!resolved.startsWith(clientDir + '/') && resolved !== clientDir) {
				return new Response('Forbidden', { status: 403 });
			}
			const filePath = url.pathname === '/' ? join(clientDir, 'index.html') : resolved;
			const file = Bun.file(filePath);
			if (await file.exists()) {
				return new Response(file);
			}

			// SPA fallback: serve index.html for unmatched routes
			return new Response(Bun.file(join(clientDir, 'index.html')));
		},
		websocket: runtime.webSockets.handler
	});

	let closing = false;
	const shutdown = async () => {
		if (closing) return;
		closing = true;
		server.stop(true);
		await runtime.close();
	};
	const stopFromSignal = () => void shutdown().finally(() => process.exit(0));
	process.once('SIGINT', stopFromSignal);
	process.once('SIGTERM', stopFromSignal);

	const url = localUrl(cli.host, server.port as number);
	console.log(`Web Agent v${packageJson.version} listening at ${url}`);
	if (cli.open) openBrowser(url);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
