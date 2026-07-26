export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '127.0.0.1';

export interface WebAgentCliOptions {
	/** The requested port. A server may choose a later available port. */
	port: number;
	host: string;
	open: boolean;
	piPath?: string;
	/** Pi startup arguments, excluding the mandatory `--mode rpc` pair. */
	piArgs: string[];
	sessionDir?: string;
}

export class CliError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CliError';
	}
}

const valueOptions = new Set([
	'--port',
	'--host',
	'--bind',
	'--pi',
	'--session',
	'--session-dir',
	'--name',
	'--provider',
	'--model',
	'--thinking',
	'--api-key'
]);

const piFlagOptions = new Map<string, string>([
	['--continue', '--continue'],
	['-c', '--continue'],
	['--resume', '--resume'],
	['-r', '--resume'],
	['--no-session', '--no-session']
]);

export function parsePort(value: string): number {
	if (!/^\d+$/.test(value)) {
		throw new CliError(`Invalid port "${value}". Use an integer from 0 to 65535.`);
	}

	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
		throw new CliError(`Invalid port "${value}". Use an integer from 0 to 65535.`);
	}
	return port;
}

function optionValue(argv: readonly string[], index: number, option: string): [string, number] {
	const next = argv[index + 1];
	if (next === undefined || next.startsWith('--')) {
		throw new CliError(`${option} requires a value.`);
	}
	return [next, index + 1];
}

function splitEqualsOption(argument: string): [string, string | undefined] {
	const equalsIndex = argument.indexOf('=');
	return equalsIndex === -1
		? [argument, undefined]
		: [argument.slice(0, equalsIndex), argument.slice(equalsIndex + 1)];
}

/** Parse only Web Agent's deliberately small, documented CLI surface. */
export function parseCliArgs(
	argv: readonly string[],
	env: NodeJS.ProcessEnv = process.env
): WebAgentCliOptions {
	let portValue = env.PI_WEB_PORT ?? String(DEFAULT_PORT);
	let host = DEFAULT_HOST;
	let open = false;
	let piPath: string | undefined;
	let sessionDir: string | undefined;
	const piArgs: string[] = [];

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const [option, inlineValue] = splitEqualsOption(argument);

		if (option === '--open') {
			if (inlineValue !== undefined) throw new CliError('--open does not accept a value.');
			open = true;
			continue;
		}

		if (piFlagOptions.has(option)) {
			if (inlineValue !== undefined) throw new CliError(`${option} does not accept a value.`);
			piArgs.push(piFlagOptions.get(option)!);
			continue;
		}

		if (!valueOptions.has(option)) {
			throw new CliError(`Unknown option: ${argument}`);
		}

		const [value, consumedIndex] =
			inlineValue === undefined ? optionValue(argv, index, option) : [inlineValue, index];
		if (!value) throw new CliError(`${option} requires a value.`);
		index = consumedIndex;

		switch (option) {
			case '--port':
				portValue = value;
				break;
			case '--host':
			case '--bind':
				host = value;
				break;
			case '--pi':
				piPath = value;
				break;
			default:
				piArgs.push(option, value);
				if (option === '--session-dir') sessionDir = value;
		}
	}

	const port = parsePort(portValue);
	return { port, host, open, piPath, piArgs, sessionDir };
}

/** Pi's RPC transport is never optional, even when forwarding startup flags. */
export function buildPiArguments(options: Pick<WebAgentCliOptions, 'piArgs'>): string[] {
	return ['--mode', 'rpc', ...options.piArgs];
}

export const CLI_HELP = `Usage: web-agent [options]

Options:
  --port <number>        Requested HTTP port (default: PI_WEB_PORT or ${DEFAULT_PORT})
  --host, --bind <addr>  Listen address (default: ${DEFAULT_HOST})
  --open                 Open the selected URL after startup
  --pi <path>            Pi executable (otherwise PI_BIN, then PATH)

Forwarded Pi options:
  --continue, -c  --resume, -r  --session <path-or-id>  --no-session
  --session-dir <path>  --name <name>  --provider <provider>
  --model <model>  --thinking <level>  --api-key <key>`;
