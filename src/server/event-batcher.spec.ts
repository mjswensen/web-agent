import { describe, expect, it, vi } from 'vitest';
import { EventBatcher } from './event-batcher.js';

describe('EventBatcher', () => {
	it('coalesces streaming updates to one animation-frame-scale batch', () => {
		vi.useFakeTimers();
		const flushed: unknown[][] = [];
		const batcher = new EventBatcher((events) => flushed.push(events), 16);

		batcher.push({
			type: 'message_update',
			message: { timestamp: 1 },
			assistantMessageEvent: { contentIndex: 0, type: 'text_delta', delta: 'a' }
		});
		batcher.push({ type: 'tool_execution_update', toolCallId: 'tool-1', partialResult: 'first' });
		batcher.push({
			type: 'message_update',
			message: { timestamp: 1 },
			assistantMessageEvent: { contentIndex: 0, type: 'text_delta', delta: 'ab' }
		});
		batcher.push({ type: 'tool_execution_update', toolCallId: 'tool-1', partialResult: 'second' });
		vi.advanceTimersByTime(16);

		expect(flushed).toEqual([
			[
				{
					type: 'message_update',
					message: { timestamp: 1 },
					assistantMessageEvent: { contentIndex: 0, type: 'text_delta', delta: 'ab' }
				},
				{ type: 'tool_execution_update', toolCallId: 'tool-1', partialResult: 'second' }
			]
		]);
		vi.useRealTimers();
	});

	it('flushes pending deltas before terminal events', () => {
		const flushed: unknown[][] = [];
		const batcher = new EventBatcher((events) => flushed.push(events));
		batcher.push({
			type: 'message_update',
			message: { timestamp: 1 },
			assistantMessageEvent: { contentIndex: 0 }
		});
		batcher.push({ type: 'message_end', message: { timestamp: 1 } });

		expect(flushed).toEqual([
			[
				{
					type: 'message_update',
					message: { timestamp: 1 },
					assistantMessageEvent: { contentIndex: 0 }
				}
			],
			[{ type: 'message_end', message: { timestamp: 1 } }]
		]);
	});
});
