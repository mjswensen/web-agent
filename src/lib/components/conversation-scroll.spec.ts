import { describe, expect, it, vi } from 'vitest';
import { isConversationAtBottom, scrollConversationToBottom } from './conversation-scroll.js';

describe('conversation scrolling', () => {
	it('uses a stable bottom threshold for the latest-content affordance', () => {
		expect(isConversationAtBottom({ scrollHeight: 1000, scrollTop: 568, clientHeight: 400 })).toBe(
			true
		);
		expect(isConversationAtBottom({ scrollHeight: 1000, scrollTop: 567, clientHeight: 400 })).toBe(
			false
		);
	});

	it('smoothly scrolls the conversation to its current bottom', () => {
		const scrollTo = vi.fn();
		scrollConversationToBottom({ scrollHeight: 1234, scrollTo });
		expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'smooth' });
	});
});
