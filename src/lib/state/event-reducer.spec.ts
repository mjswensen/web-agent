import { describe, expect, it } from 'vitest';
import {
	initialConversationState,
	reduceConversationEvent,
	reduceMessagesSnapshot
} from './event-reducer.js';

describe('conversation event reducer', () => {
	it('hydrates Pi message history into renderable conversation records', () => {
		const state = reduceMessagesSnapshot({
			messages: [
				{ role: 'user', timestamp: 1, content: 'Inspect the repository' },
				{
					role: 'assistant',
					timestamp: 2,
					content: [
						{ type: 'thinking', thinking: 'I should inspect files.' },
						{ type: 'text', text: 'I will inspect the repository.' }
					]
				}
			]
		});

		expect(state).toMatchObject({
			isStreaming: false,
			messages: [
				{ role: 'user', text: 'Inspect the repository' },
				{
					role: 'assistant',
					thinking: 'I should inspect files.',
					text: 'I will inspect the repository.'
				}
			]
		});
	});

	it('updates one provisional assistant record as text streams and completes', () => {
		let state = reduceConversationEvent(initialConversationState(), { type: 'agent_start' });
		state = reduceConversationEvent(state, {
			type: 'message_start',
			message: { role: 'assistant', timestamp: 10, content: [] }
		});
		state = reduceConversationEvent(state, {
			type: 'message_update',
			message: { role: 'assistant', timestamp: 10, content: [{ type: 'text', text: 'partial' }] }
		});
		state = reduceConversationEvent(state, {
			type: 'message_end',
			message: { role: 'assistant', timestamp: 10, content: [{ type: 'text', text: 'complete' }] }
		});
		state = reduceConversationEvent(state, { type: 'agent_settled' });

		expect(state).toEqual({
			isStreaming: false,
			messages: [
				{
					id: 'assistant:10',
					role: 'assistant',
					text: 'complete',
					thinking: '',
					timestamp: 10,
					isStreaming: false
				}
			]
		});
	});
});
