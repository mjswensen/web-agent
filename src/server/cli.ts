export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '127.0.0.1';

export type WebAgentEnvironment = Record<string, string | undefined>;

export interface SdkStartupOptions {
	continueSession: boolean;
	noSession: boolean;
	session?: string;
	sessionDir?: string;
	name?: string;
	provider?: string;
	model?: string;
	thinking?: string;
	apiKey?: string;
}

export interface WebAgentCliOptions {
	port: number;
	host: string;
	open: boolean;
	sdk: SdkStartupOptions;
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
	'--session',
	'--session-dir',
	'--name',
	'--provider',
	'--model',
	'--thinking',
	'--api-key'
]);

export function parsePort(value: string): number {
	if (!/^\d+$/.test(value))
		throw new CliError(`Invalid port "${value}". Use an integer from 0 to 65535.`);
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
		throw new CliError(`Invalid port "${value}". Use an integer from 0 to 65535.`);
	return port;
}

function optionValue(argv: readonly string[], index: number, option: string): [string, number] {
	const next = argv[index + 1];
	if (next === undefined || next.startsWith('--'))
		throw new CliError(`${option} requires a value.`);
	return [next, index + 1];
}

function splitEqualsOption(argument: string): [string, string | undefined] {
	const index = argument.indexOf('=');
	return index < 0 ? [argument, undefined] : [argument.slice(0, index), argument.slice(index + 1)];
}

export function parseCliArgs(
	argv: readonly string[],
	env: WebAgentEnvironment = process.env
): WebAgentCliOptions {
	let portValue = env.PI_WEB_PORT ?? String(DEFAULT_PORT);
	let host = DEFAULT_HOST;
	let open = false;
	const sdk: SdkStartupOptions = { continueSession: false, noSession: false };

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const [option, inlineValue] = splitEqualsOption(argument);
		if (
			option === '--open' ||
			option === '--continue' ||
			option === '-c' ||
			option === '--no-session'
		) {
			if (inlineValue !== undefined) throw new CliError(`${option} does not accept a value.`);
			if (option === '--open') open = true;
			else if (option === '--no-session') sdk.noSession = true;
			else sdk.continueSession = true;
			continue;
		}
		if (option === '--pi' || option === '--resume' || option === '-r') {
			throw new CliError(`${option} was removed in Web Agent 2.0; the Pi SDK is embedded.`);
		}
		if (!valueOptions.has(option)) throw new CliError(`Unknown option: ${argument}`);
		const [value, consumed] =
			inlineValue === undefined ? optionValue(argv, index, option) : [inlineValue, index];
		if (!value) throw new CliError(`${option} requires a value.`);
		index = consumed;
		switch (option) {
			case '--port':
				portValue = value;
				break;
			case '--host':
			case '--bind':
				host = value;
				break;
			case '--session':
				sdk.session = value;
				break;
			case '--session-dir':
				sdk.sessionDir = value;
				break;
			case '--name':
				sdk.name = value;
				break;
			case '--provider':
				sdk.provider = value;
				break;
			case '--model':
				sdk.model = value;
				break;
			case '--thinking':
				sdk.thinking = value;
				break;
			case '--api-key':
				sdk.apiKey = value;
				break;
		}
	}
	if ([sdk.continueSession, sdk.noSession, sdk.session !== undefined].filter(Boolean).length > 1)
		throw new CliError('--continue, --session, and --no-session are mutually exclusive.');
	return { port: parsePort(portValue), host, open, sdk };
}

export const CLI_HELP = `Usage: web-agent [options]

Options:
  --port <number>        Requested HTTP port (default: PI_WEB_PORT or ${DEFAULT_PORT})
  --host, --bind <addr>  Listen address (default: ${DEFAULT_HOST})
  --open                 Open the selected URL after startup
  --continue, -c         Continue the latest launch-project session
  --session <path-or-id> Open a launch-project session
  --no-session           Disable session persistence
  --session-dir <path>   Use an explicit session directory
  --name <name>          Set the initial session name
  --provider <provider>  Select a model provider
  --model <model>        Select a model (optionally provider/model)
  --thinking <level>     Set the thinking level
  --api-key <key>        Runtime-only provider API key

The Pi SDK is embedded. --pi, PI_BIN, and --resume are no longer supported.`;
