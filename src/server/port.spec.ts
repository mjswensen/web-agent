import { describe, expect, it, vi } from 'vitest';
import { findAvailablePort } from './port.js';

describe('Bun server port selection', () => {
	it('moves upward after occupied ports', () => {
		const probe = vi.fn((_host: string, port: number) => {
			if (port < 3002) throw Object.assign(new Error('occupied'), { code: 'EADDRINUSE' });
			return port;
		});

		expect(findAvailablePort('127.0.0.1', 3000, probe)).toBe(3002);
		expect(probe.mock.calls.map(([, port]) => port)).toEqual([3000, 3001, 3002]);
	});

	it('preserves OS-selected port zero and non-occupancy errors', () => {
		expect(findAvailablePort('127.0.0.1', 0, () => 41_234)).toBe(41_234);
		expect(() =>
			findAvailablePort('bad-host', 3000, () => {
				throw Object.assign(new Error('bad host'), { code: 'EADDRNOTAVAIL' });
			})
		).toThrow('bad host');
	});
});
