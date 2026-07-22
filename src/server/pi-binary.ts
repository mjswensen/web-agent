import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

export type PiBinarySource = '--pi' | 'PI_BIN' | 'PATH';

export interface ResolvedPiBinary {
	path: string;
	source: PiBinarySource;
}

export interface PiBinaryResolutionOptions {
	piPath?: string;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
}

export class PiBinaryNotFoundError extends Error {
	constructor() {
		super(
			'Pi executable was not found or is not executable. Install Pi, add it to PATH, or pass --pi <path> (or set PI_BIN).'
		);
		this.name = 'PiBinaryNotFoundError';
	}
}

async function isExecutable(filePath: string): Promise<boolean> {
	try {
		const file = await stat(filePath);
		if (!file.isFile()) return false;
		await access(filePath, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function hasPathSeparator(candidate: string): boolean {
	return candidate.includes('/') || candidate.includes('\\');
}

async function findOnPath(command: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
	const pathValue = env.PATH;
	if (!pathValue) return undefined;

	const extensions =
		process.platform === 'win32'
			? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
			: [''];

	for (const directory of pathValue.split(delimiter)) {
		const base = join(directory || '.', command);
		for (const extension of extensions) {
			const candidate =
				extension && !command.toLowerCase().endsWith(extension.toLowerCase())
					? `${base}${extension}`
					: base;
			if (await isExecutable(candidate)) return candidate;
		}
	}
	return undefined;
}

async function resolveCandidate(
	candidate: string,
	env: NodeJS.ProcessEnv,
	cwd: string
): Promise<string | undefined> {
	if (isAbsolute(candidate) || hasPathSeparator(candidate)) {
		const path = resolve(cwd, candidate);
		return (await isExecutable(path)) ? path : undefined;
	}
	return findOnPath(candidate, env);
}

/**
 * Resolve Pi in the documented priority order. A non-executable explicit
 * choice does not fall through: it is an operator error, not a request to use
 * a different Pi installation.
 */
export async function resolvePiBinary(
	options: PiBinaryResolutionOptions = {}
): Promise<ResolvedPiBinary> {
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();
	const explicit = options.piPath?.trim();
	const environment = env.PI_BIN?.trim();

	if (explicit) {
		const path = await resolveCandidate(explicit, env, cwd);
		if (path) return { path, source: '--pi' };
		throw new PiBinaryNotFoundError();
	}

	if (environment) {
		const path = await resolveCandidate(environment, env, cwd);
		if (path) return { path, source: 'PI_BIN' };
		throw new PiBinaryNotFoundError();
	}

	const path = await findOnPath('pi', env);
	if (path) return { path, source: 'PATH' };
	throw new PiBinaryNotFoundError();
}

/** Useful for error messages and tests without exposing Node's path details. */
export function describeBinaryLocation(binary: ResolvedPiBinary): string {
	return `${binary.path} (resolved via ${binary.source})`;
}
