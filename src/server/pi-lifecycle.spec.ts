import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { startPiLifecycle } from './pi-lifecycle.js';
import type { SpawnFunction } from './pi-process.js';

function fakeChild(writes: string[]): ChildProcessWithoutNullStreams {
	const child = new EventEmitter() as EventEmitter & {
		stdin: Writable;
		stdout: PassThrough;
		stderr: PassThrough;
		kill: ReturnType<typeof vi.fn>;
	};
	child.stdin = new Writable({
		write(chunk, _encoding, callback) {
			writes.push(String(chunk));
			callback();
		}
	});
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.kill = vi.fn(() => true);
	return child as unknown as ChildProcessWithoutNullStreams;
}

describe('Pi lifecycle startup', () => {
	it('starts exactly one RPC child using the launch directory and forwarded flags', async () => {
		const writes: string[] = [];
		const spawn = vi.fn(((command, args, options) => {
			expect(command).toBe('/mock/pi');
			expect(options.cwd).toBe('/project');
			expect(args).toEqual(['--mode', 'rpc', '--resume', '--model', 'test-model']);
			return fakeChild(writes);
		}) satisfies SpawnFunction);
		const resolveBinary = vi.fn(async () => ({ path: '/mock/pi', source: '--pi' as const }));

		const started = await startPiLifecycle({
			argv: ['--pi', '/mock/pi', '--resume', '--model', 'test-model'],
			cwd: '/project',
			env: {},
			resolveBinary,
			spawn
		});
		await started.process.send({ id: 'request-1', command: 'get_state' });

		expect(resolveBinary).toHaveBeenCalledWith({
			piPath: '/mock/pi',
			env: {},
			cwd: '/project'
		});
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(writes).toEqual(['{"id":"request-1","command":"get_state"}\n']);
	});
});
