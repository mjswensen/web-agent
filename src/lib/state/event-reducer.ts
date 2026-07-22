import type { JsonObject, JsonValue } from '../client/protocol.js';

export type ConversationRole = 'user' | 'assistant' | 'tool' | 'system';
export type ToolExecutionStatus = 'pending' | 'success' | 'error';

export interface ConversationMessage {
	id: string;
	role: ConversationRole;
	text: string;
	thinking: string;
	timestamp?: number;
	isStreaming: boolean;
	error?: string;
}

export interface ToolExecution {
	id: string;
	name: string;
	args: string;
	output: string;
	diff?: string;
	status: ToolExecutionStatus;
	parentMessageId?: string;
}

export interface ConversationState {
	messages: ConversationMessage[];
	tools: ToolExecution[];
	isStreaming: boolean;
	lastAssistantId?: string;
	lastError?: string;
}

export const initialConversationState = (): ConversationState => ({
	messages: [],
	tools: [],
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

function formatJson(value: JsonValue | undefined): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function toolOutput(value: JsonValue | undefined): string {
	if (!isObject(value)) return formatJson(value);
	const content = textFromContent(value.content, 'text');
	return content || formatJson(value);
}

function toolDiff(value: JsonValue | undefined): string | undefined {
	if (!isObject(value) || !isObject(value.details)) return undefined;
	if (typeof value.details.diff === 'string') return value.details.diff;
	if (typeof value.details.patch === 'string') return value.details.patch;
	return undefined;
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
	const index = items.findIndex((existing) => existing.id === item.id);
	if (index === -1) return [...items, item];
	return items.map((existing, current) =>
		current === index ? { ...existing, ...item } : existing
	);
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

/** Hydrates the durable message history returned by Pi's `get_messages` response. */
export function reduceMessagesSnapshot(data: JsonValue): ConversationState {
	if (!isObject(data) || !Array.isArray(data.messages)) return initialConversationState();
	const messages = data.messages
		.map(toConversationMessage)
		.filter((message): message is ConversationMessage => message !== undefined);
	const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
	return { messages, tools: [], isStreaming: false, lastAssistantId: lastAssistant?.id };
}

function withMessage(state: ConversationState, message: ConversationMessage): ConversationState {
	const next = {
		...state,
		messages: upsert(state.messages, message),
		...(message.role === 'assistant' ? { lastAssistantId: message.id } : {})
	};
	return next;
}

function toolFromStart(
	event: JsonObject,
	parentMessageId: string | undefined
): ToolExecution | undefined {
	if (typeof event.toolCallId !== 'string' || typeof event.toolName !== 'string') return undefined;
	return {
		id: event.toolCallId,
		name: event.toolName,
		args: formatJson(event.args),
		output: '',
		status: 'pending',
		...(parentMessageId ? { parentMessageId } : {})
	};
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
		case 'message_start':
		case 'message_update':
		case 'message_end': {
			const message = toConversationMessage(event.message);
			if (!message) return state;
			if (message.role === 'tool') return state;
			const isStreaming = event.type !== 'message_end' && message.role === 'assistant';
			return withMessage(state, { ...message, isStreaming });
		}
		case 'tool_execution_start': {
			const tool = toolFromStart(event, state.lastAssistantId);
			return tool ? { ...state, tools: upsert(state.tools, tool) } : state;
		}
		case 'tool_execution_update': {
			if (typeof event.toolCallId !== 'string') return state;
			const previous = state.tools.find((tool) => tool.id === event.toolCallId);
			const tool: ToolExecution = {
				id: event.toolCallId,
				name: typeof event.toolName === 'string' ? event.toolName : (previous?.name ?? 'tool'),
				args: formatJson(event.args) || previous?.args || '',
				output: toolOutput(event.partialResult),
				status: 'pending',
				...(previous?.parentMessageId ? { parentMessageId: previous.parentMessageId } : {})
			};
			return { ...state, tools: upsert(state.tools, tool) };
		}
		case 'tool_execution_end': {
			if (typeof event.toolCallId !== 'string') return state;
			const previous = state.tools.find((tool) => tool.id === event.toolCallId);
			const result = event.result;
			const tool: ToolExecution = {
				id: event.toolCallId,
				name: typeof event.toolName === 'string' ? event.toolName : (previous?.name ?? 'tool'),
				args: previous?.args ?? '',
				output: toolOutput(result),
				status: event.isError === true ? 'error' : 'success',
				...(toolDiff(result) ? { diff: toolDiff(result) } : {}),
				...(previous?.parentMessageId ? { parentMessageId: previous.parentMessageId } : {})
			};
			return { ...state, tools: upsert(state.tools, tool) };
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
