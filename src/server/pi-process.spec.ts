import { describe, expect, it } from 'vitest';
import { PiProcess, StrictJsonlReader, StrictLfReader, type PiSubprocess } from './pi-process.js';

const encoder = new TextEncoder();

describe('strict Pi JSONL reader', () => {
	it('handles UTF-8 chunk boundaries, CRLF, and a final record', () => {
		const records: Array<{ message: string }> = [];
		const errors: Error[] = [];
		const reader = new StrictJsonlReader<(typeof records)[number]>(
			(record) => records.push(record),
			(error) => errors.push(error)
		);
		const input = encoder.encode('{"message":"café"}\r\n{"message":"done"}');

		reader.push(input.slice(0, 16));
		reader.push(input.slice(16));
		reader.finish();

		expect(records).toEqual([{ message: 'café' }, { message: 'done' }]);
		expect(errors).toEqual([]);
	});

	it('splits only on LF, not Unicode line separators embedded in JSON', () => {
		const records: Array<{ message: string }> = [];
		const reader = new StrictJsonlReader<(typeof records)[number]>(
			(record) => records.push(record),
			() => undefined
		);

		reader.push('{"message":"first\u2028second"}\n');
		reader.finish();

		expect(records).toEqual([{ message: 'first second' }]);
	});

	it('reports invalid JSON but continues with subsequent records', () => {
		const records: unknown[] = [];
		const errors: Error[] = [];
		const reader = new StrictJsonlReader(
			(record) => records.push(record),
			(error) => errors.push(error)
		);

		reader.push('not-json\n{"valid":true}\n');
		reader.finish();

		expect(records).toEqual([{ valid: true }]);
		expect(errors).toHaveLength(1);
	});

	it('removes exactly one trailing CR from each LF-delimited record', () => {
		const records: string[] = [];
		const reader = new StrictLfReader((record) => records.push(record));

		reader.push('one\r\n\r\r\n\n');
		reader.finish();

		expect(records).toEqual(['one', '\r', '']);
	});

	it('awaits Bun stdin flushing after writing exactly one LF-terminated record', async () => {
		const writes: string[] = [];
		let releaseFlush!: () => void;
		const flushed = new Promise<void>((resolve) => (releaseFlush = resolve));
		const child: PiSubprocess = {
			stdin: {
				write(data) {
					writes.push(String(data));
					return String(data).length;
				},
				async flush() {
					await flushed;
					return 0;
				},
				end: () => undefined
			},
			stdout: new ReadableStream(),
			stderr: new ReadableStream(),
			exited: new Promise<number>(() => undefined),
			signalCode: null,
			kill: () => undefined
		};
		const process = new PiProcess({
			command: '/mock/pi',
			args: [],
			cwd: '/project',
			spawn: () => child
		});
		let completed = false;
		const sending = process.send({ type: 'get_state' }).then(() => (completed = true));

		await Promise.resolve();
		expect(writes).toEqual(['{"type":"get_state"}\n']);
		expect(completed).toBe(false);
		releaseFlush();
		await sending;
		expect(completed).toBe(true);
	});

	it('force-kills a Pi child that does not exit during the graceful period', async () => {
		let resolveExit!: (code: number) => void;
		const signals: Array<string | number | undefined> = [];
		let signalCode: number | null = null;
		const child: PiSubprocess = {
			stdin: { write: () => 0, flush: () => 0, end: () => undefined },
			stdout: new ReadableStream(),
			stderr: new ReadableStream(),
			exited: new Promise<number>((resolve) => (resolveExit = resolve)),
			get signalCode() {
				return signalCode;
			},
			kill(signal) {
				signals.push(signal);
				if (signal === 'SIGKILL') {
					signalCode = 9;
					resolveExit(137);
				}
			}
		};
		const process = new PiProcess({
			command: '/mock/pi',
			args: [],
			cwd: '/project',
			spawn: () => child
		});

		await expect(process.stop(0)).resolves.toEqual({ code: 137, signal: 9 });
		expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
	});
});
