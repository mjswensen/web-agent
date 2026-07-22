import type { JsonObject, JsonValue } from '../client/protocol.js';

export type ConversationRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ConversationMessage {
	id: string;
	role: ConversationRole;
	text: string;
	thinking: string;
	timestamp?: number;
	isStreaming: boolean;
	error?: string;
}

export interface ConversationState {
	messages: ConversationMessage[];
	isStreaming: boolean;
	lastError?: string;
}

export const initialConversationState = (): ConversationState => ({
	messages: [],
	isStreaming: false
});

function isObject(value: JsonValue | undefined): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textFromContent(content: JsonValue | undefined, key: 'text' | 'thinking'): string {
	if (typeof content === 'string') return key === 'text' ? content : '';
	if (!Array.isArray(content)) return '';
	return content
		.filter(isObject)
		.filter((block) => (key === 'text' ? block.type === 'text' : block.type === 'thinking'))
		.map((block) => (typeof block[key] === 'string' ? block[key] : ''))
		.join('');
}

function messageId(message: JsonObject): string {
	if (typeof message.toolCallId === 'string') return `tool:${message.toolCallId}`;
	if (typeof message.responseId === 'string') return `assistant:${message.responseId}`;
	const role = typeof message.role === 'string' ? message.role : 'system';
	if (typeof message.timestamp === 'number') return `${role}:${message.timestamp}`;
	return `${role}:${textFromContent(message.content, 'text').slice(0, 64)}`;
}

export function toConversationMessage(value: JsonValue): ConversationMessage | undefined {
	if (!isObject(value) || typeof value.role !== 'string') return undefined;
	const role: ConversationRole =
		value.role === 'user' || value.role === 'assistant'
			? value.role
			: value.role === 'toolResult'
				? 'tool'
				: 'system';
	const text = textFromContent(value.content, 'text');
	const thinking = textFromContent(value.content, 'thinking');
	const error = typeof value.errorMessage === 'string' ? value.errorMessage : undefined;
	return {
		id: messageId(value),
		role,
		text,
		thinking,
		timestamp: typeof value.timestamp === 'number' ? value.timestamp : undefined,
		isStreaming: false,
		...(error ? { error } : {})
	};
}

function upsert(
	messages: ConversationMessage[],
	message: ConversationMessage
): ConversationMessage[] {
	const index = messages.findIndex((existing) => existing.id === message.id);
	if (index === -1) return [...messages, message];
	return messages.map((existing, current) =>
		current === index ? { ...existing, ...message } : existing
	);
}

/** Hydrates the durable message history returned by Pi's `get_messages` response. */
export function reduceMessagesSnapshot(data: JsonValue): ConversationState {
	if (!isObject(data) || !Array.isArray(data.messages)) return initialConversationState();
	const messages = data.messages
		.map(toConversationMessage)
		.filter((message): message is ConversationMessage => message !== undefined);
	return { messages, isStreaming: false };
}

/** Idempotently reduces Pi lifecycle events into a renderable conversation. */
export function reduceConversationEvent(
	state: ConversationState,
	event: JsonObject
): ConversationState {
	switch (event.type) {
		case 'agent_start':
			return { ...state, isStreaming: true };
		case 'agent_end':
		case 'agent_settled':
			return { ...state, isStreaming: false };
		case 'message_start': {
			const message = toConversationMessage(event.message);
			if (!message) return state;
			return {
				...state,
				messages: upsert(state.messages, { ...message, isStreaming: message.role === 'assistant' })
			};
		}
		case 'message_update': {
			const message = toConversationMessage(event.message);
			if (!message) return state;
			return {
				...state,
				messages: upsert(state.messages, { ...message, isStreaming: message.role === 'assistant' })
			};
		}
		case 'message_end': {
			const message = toConversationMessage(event.message);
			if (!message) return state;
			return { ...state, messages: upsert(state.messages, { ...message, isStreaming: false }) };
		}
		case 'extension_error':
			return {
				...state,
				lastError: typeof event.error === 'string' ? event.error : 'An extension failed.'
			};
		default:
			return state;
	}
}
