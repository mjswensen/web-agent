import { describe, expect, it, vi } from 'vitest';
import { startPiLifecycle } from './pi-lifecycle.js';
import type { PiSubprocess, SpawnFunction } from './pi-process.js';

function fakeChild(writes: string[]): PiSubprocess {
	return {
		stdin: {
			write(data) {
				writes.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
				return typeof data === 'string' ? data.length : data.byteLength;
			},
			flush: vi.fn(async () => 0),
			end: vi.fn(() => undefined)
		},
		stdout: new ReadableStream(),
		stderr: new ReadableStream(),
		exited: new Promise<number>(() => undefined),
		signalCode: null,
		kill: vi.fn()
	};
}

describe('Pi lifecycle startup', () => {
	it('starts exactly one RPC child using the launch directory and forwarded flags', async () => {
		const writes: string[] = [];
		const spawn = vi.fn(((options) => {
			expect(options.cmd).toEqual([
				'/mock/pi',
				'--mode',
				'rpc',
				'--resume',
				'--model',
				'test-model'
			]);
			expect(options.cwd).toBe('/project');
			expect(options).toMatchObject({ stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
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
