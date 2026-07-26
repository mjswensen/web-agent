#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import type { AddressInfo } from 'node:net';
import { CLI_HELP, parseCliArgs } from './cli.js';
import { createWebAgentRuntime, listenOnAvailablePort } from './main.js';

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
	const child = spawn(command.executable, command.args, { detached: true, stdio: 'ignore' });
	child.unref();
}

if (process.argv.slice(2).some((argument) => argument === '--help' || argument === '-h')) {
	console.log(CLI_HELP);
	process.exit(0);
}

try {
	const argv = process.argv.slice(2);
	const cli = parseCliArgs(argv);
	// This file compiles to build/server-runtime/server; from there the adapter
	// output is ../../handler.js. Dynamic loading keeps generated code out of
	// the source TypeScript project.
	const { handler } = await import('../../' + 'handler.js');
	const runtime = await createWebAgentRuntime(handler, { argv, cwd: process.cwd() });
	const address: AddressInfo = await listenOnAvailablePort(runtime, cli.host, cli.port);
	const url = localUrl(cli.host, address.port);
	console.log(`Web Agent listening at ${url}`);
	if (cli.open) openBrowser(url);

	let closing = false;
	const shutdown = async () => {
		if (closing) return;
		closing = true;
		await runtime.close();
		process.exit(0);
	};
	process.once('SIGINT', () => void shutdown());
	process.once('SIGTERM', () => void shutdown());
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
