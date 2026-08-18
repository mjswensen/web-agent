#!/usr/bin/env bun
import packageJson from '../../package.json' with { type: 'json' };
import { CLI_HELP, parseCliArgs } from './cli.js';
import { createWebAgentRuntime } from './main.js';
import { findAvailablePort } from './port.js';
import { clearWebAgentRuntime, setWebAgentRuntime } from './runtime-context.js';

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
	process.env.HTTP_HOST = cli.host;
	process.env.HTTP_PORT = String(port);

	const runtime = await createWebAgentRuntime({ argv, cwd: process.cwd() });
	setWebAgentRuntime(runtime);
	let closing = false;
	const shutdown = async () => {
		if (closing) return;
		closing = true;
		await runtime.close();
		clearWebAgentRuntime(runtime);
	};
	const stopFromSignal = () => void shutdown().finally(() => process.exit(0));
	process.once('SIGINT', stopFromSignal);
	process.once('SIGTERM', stopFromSignal);

	try {
		// Import adapter-bun's documented runtime entry point after setting its
		// host/port and the shared broker used by hooks.server.
		// @ts-expect-error adapter-bun generates this module before the server TypeScript emit.
		const adapter = (await import('../../index.js')) as { serve(): void };
		// The generated adapter detects and starts itself in a compiled Bun binary.
		if (Bun.embeddedFiles.length === 0) adapter.serve();
		const url = localUrl(cli.host, port);
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
