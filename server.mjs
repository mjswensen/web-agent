#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import { handler } from './build/handler.js';
import { CLI_HELP, parseCliArgs } from './build/server-runtime/server/cli.js';
import {
	createWebAgentRuntime,
	listenOnAvailablePort
} from './build/server-runtime/server/main.js';

function localUrl(host, port) {
	return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

function openBrowser(url) {
	const command =
		process.platform === 'darwin'
			? ['open', [url]]
			: process.platform === 'win32'
				? ['cmd', ['/c', 'start', '', url]]
				: ['xdg-open', [url]];
	const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
	child.unref();
}

if (process.argv.slice(2).some((argument) => argument === '--help' || argument === '-h')) {
	console.log(CLI_HELP);
	process.exit(0);
}

try {
	const argv = process.argv.slice(2);
	const cli = parseCliArgs(argv);
	const runtime = await createWebAgentRuntime(handler, { argv, cwd: process.cwd() });
	const address = await listenOnAvailablePort(runtime, cli.host, cli.port);
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
