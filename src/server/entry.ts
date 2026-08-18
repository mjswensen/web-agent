#!/usr/bin/env bun
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../../package.json' with { type: 'json' };
import { CLI_HELP, parseCliArgs } from './cli.js';
import { createWebAgentRuntime } from './main.js';
import { findAvailablePort } from './port.js';
import { createStaticFileServer } from './static-files.js';

// The client bundle emitted by `vite build` sits next to the compiled server
// output inside `build/` (see tsconfig.server.json and package.json).
const clientRoot = join(dirname(fileURLToPath(import.meta.url)), '../../client');

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

try {
	const argv = process.argv.slice(2);
	const cli = parseCliArgs(argv);
	const port = findAvailablePort(cli.host, cli.port);

	const runtime = await createWebAgentRuntime({ argv, cwd: process.cwd() });
	const staticFiles = createStaticFileServer(clientRoot);
	let closing = false;
	const shutdown = async () => {
		if (closing) return;
		closing = true;
		await runtime.close();
	};
	const stopFromSignal = () => void shutdown().finally(() => process.exit(0));
	process.once('SIGINT', stopFromSignal);
	process.once('SIGTERM', stopFromSignal);

	try {
		const server = Bun.serve({
			hostname: cli.host,
			port,
			fetch(request, bunServer) {
				const { pathname } = new URL(request.url);
				if (pathname === '/ws') {
					return bunServer.upgrade(request)
						? undefined
						: new Response('WebSocket upgrade failed.', { status: 400 });
				}
				return staticFiles.handle(request) ?? new Response('Not found.', { status: 404 });
			},
			websocket: runtime.webSockets.handler
		});
		const url = localUrl(cli.host, server.port ?? port);
		console.log(`Web Agent v${packageJson.version} listening at ${url}`);
		if (cli.open) openBrowser(url);
	} catch (error) {
		await shutdown();
		throw error;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
