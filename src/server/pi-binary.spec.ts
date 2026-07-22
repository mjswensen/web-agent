import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PiBinaryNotFoundError, resolvePiBinary } from './pi-binary.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
	);
});

async function executable(directory: string, name: string): Promise<string> {
	const path = join(directory, name);
	await writeFile(path, '#!/bin/sh\nexit 0\n');
	await chmod(path, 0o755);
	return path;
}

describe('Pi binary resolution', () => {
	it('uses --pi before PI_BIN and PATH', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'web-agent-pi-'));
		temporaryDirectories.push(directory);
		const explicit = await executable(directory, 'explicit-pi');
		const environment = await executable(directory, 'environment-pi');
		await executable(directory, 'pi');

		const resolved = await resolvePiBinary({
			piPath: explicit,
			env: { PI_BIN: environment, PATH: directory }
		});
		expect(resolved).toEqual({ path: explicit, source: '--pi' });
	});

	it('uses PI_BIN before a Pi executable found on PATH', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'web-agent-pi-'));
		temporaryDirectories.push(directory);
		const environment = await executable(directory, 'environment-pi');
		await executable(directory, 'pi');

		const resolved = await resolvePiBinary({ env: { PI_BIN: environment, PATH: directory } });
		expect(resolved).toEqual({ path: environment, source: 'PI_BIN' });
	});

	it('finds an executable Pi on PATH and rejects missing choices clearly', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'web-agent-pi-'));
		temporaryDirectories.push(directory);
		const pathPi = await executable(directory, 'pi');

		await expect(resolvePiBinary({ env: { PATH: directory } })).resolves.toEqual({
			path: pathPi,
			source: 'PATH'
		});
		await expect(
			resolvePiBinary({ piPath: join(directory, 'missing'), env: { PATH: directory } })
		).rejects.toBeInstanceOf(PiBinaryNotFoundError);
	});
});
