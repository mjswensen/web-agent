#!/usr/bin/env bun
import packageJson from '../../package.json' with { type: 'json' };
import { Buffer } from 'node:buffer';
import { CLI_HELP, parseCliArgs } from './cli.js';
import { embeddedAssets } from './embedded-assets.generated.js';
import { createWebAgentRuntime } from './main.js';
import { findAvailablePort } from './port.js';

function localUrl(host: string, port: number): string {
	return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

function openBrowser(url: string): void {
	const command =
		process.platform === 'darwin'
			? ['open', url]
			: process.platform === 'win32'
				? ['cmd', '/c', 'start', '', url]
				: ['xdg-open', url];
	const child = Bun.spawn({ cmd: command, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
	child.unref();
}

if (process.argv.slice(2).some((argument) => argument === '--help' || argument === '-h')) {
	console.log(CLI_HELP);
	process.exit(0);
}

function assetResponse(pathname: string): Response {
	const key = pathname === '/' ? '/index.html' : pathname;
	const asset = embeddedAssets[key as keyof typeof embeddedAssets] ?? embeddedAssets['/index.html'];
	return new Response(Buffer.from(asset.base64, 'base64'), {
		headers: {
			'content-type': asset.contentType,
			'cache-control': key === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
		}
	});
}

try {
	const cli = parseCliArgs(process.argv.slice(2));
	const port = findAvailablePort(cli.host, cli.port);
	const runtime = await createWebAgentRuntime(cli.sdk, process.cwd());
	const server = Bun.serve({
		hostname: cli.host,
		port,
		fetch(request, server) {
			const url = new URL(request.url);
			if (url.pathname === '/ws') {
				const upgraded = server.upgrade(request, { data: undefined });
				return upgraded
					? (undefined as unknown as Response)
					: new Response('WebSocket upgrade failed.', { status: 400 });
			}
			return assetResponse(url.pathname);
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
