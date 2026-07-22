import { describe, expect, it } from 'vitest';
import { StrictJsonlReader, StrictLfReader } from './pi-process.js';

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
});
