import { buildPiArguments, parseCliArgs, type WebAgentCliOptions } from './cli.js';
import {
	resolvePiBinary,
	type PiBinaryResolutionOptions,
	type ResolvedPiBinary
} from './pi-binary.js';
import { PiProcess, type PiProcessOptions } from './pi-process.js';

export interface PiLifecycleOptions {
	argv: readonly string[];
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	resolveBinary?: (options: PiBinaryResolutionOptions) => Promise<ResolvedPiBinary>;
	spawn?: PiProcessOptions['spawn'];
}

export interface StartedPi {
	cli: WebAgentCliOptions;
	binary: ResolvedPiBinary;
	process: PiProcess;
}

/**
 * Creates the sole Pi child for a Web Agent server. HTTP/WebSocket startup is
 * intentionally separate; callers start this only after their local listener
 * is ready and retain the returned process for the server lifetime.
 */
export async function startPiLifecycle(options: PiLifecycleOptions): Promise<StartedPi> {
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();
	const cli = parseCliArgs(options.argv, env);
	const binary = await (options.resolveBinary ?? resolvePiBinary)({
		piPath: cli.piPath,
		env,
		cwd
	});
	const piProcess = new PiProcess({
		command: binary.path,
		args: buildPiArguments(cli),
		cwd,
		env,
		spawn: options.spawn
	});

	return { cli, binary, process: piProcess };
}
