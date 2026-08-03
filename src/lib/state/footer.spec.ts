import { describe, expect, it } from 'vitest';
import { deriveFooterValues } from './footer.js';

describe('footer display values', () => {
	it('shows unavailable metrics as em dashes rather than invented zeroes', () => {
		expect(deriveFooterValues({}, {})).toEqual({
			model: '—',
			thinking: '—',
			tokens: '—',
			cost: '—',
			context: { percent: undefined, percentage: '—', details: '' }
		});
	});

	it('formats model, token, cost, and context values from RPC snapshots', () => {
		expect(
			deriveFooterValues(
				{ model: { name: 'Test Model' }, thinkingLevel: 'high' },
				{
					tokens: { input: 1200, output: 300, cacheRead: 50, cacheWrite: 25 },
					cost: 0.01234,
					contextUsage: { percent: 12.5, tokens: 2500, contextWindow: 20000 }
				}
			)
		).toEqual({
			model: 'Test Model',
			thinking: 'high',
			tokens: '1,200 in / 300 out · 50 cache read / 25 cache write',
			cost: '$0.0123',
			context: { percent: 12.5, percentage: '12.5%', details: ' (2,500 / 20,000)' }
		});
	});
});
