import type { JsonObject } from '../lib/client/protocol.js';

export type BatchedEventListener = (events: JsonObject[]) => void;

const immediateEventTypes = new Set([
	'agent_start',
	'agent_end',
	'agent_settled',
	'message_end',
	'tool_execution_start',
	'tool_execution_end',
	'queue_update',
	'session_info_changed',
	'session_start',
	'compaction_start',
	'compaction_end',
	'auto_retry_start',
	'auto_retry_end'
]);

function eventKey(event: JsonObject): string | undefined {
	if (event.type === 'tool_execution_update' && typeof event.toolCallId === 'string') {
		return `tool:${event.toolCallId}`;
	}
	if (event.type !== 'message_update') return undefined;
	const message = event.message;
	if (!message || typeof message !== 'object' || Array.isArray(message)) return undefined;
	const messageId =
		typeof message.responseId === 'string'
			? message.responseId
			: typeof message.timestamp === 'number'
				? String(message.timestamp)
				: undefined;
	const assistantEvent = event.assistantMessageEvent;
	const contentIndex =
		assistantEvent &&
		typeof assistantEvent === 'object' &&
		!Array.isArray(assistantEvent) &&
		typeof assistantEvent.contentIndex === 'number'
			? assistantEvent.contentIndex
			: undefined;
	return messageId === undefined || contentIndex === undefined
		? undefined
		: `message:${messageId}:${contentIndex}`;
}

function isImmediate(event: JsonObject): boolean {
	if (typeof event.type !== 'string') return true;
	return immediateEventTypes.has(event.type) || event.type.includes('error');
}

/**
 * Keeps token-heavy RPC events near animation-frame cadence without changing
 * Pi's terminal lifecycle semantics. Replaced tool partial results are safe
 * because Pi defines them as cumulative.
 */
export class EventBatcher {
	private events: JsonObject[] = [];
	private readonly positions = new Map<string, number>();
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly onFlush: BatchedEventListener,
		private readonly intervalMs = 16
	) {}

	push(event: JsonObject): void {
		if (isImmediate(event)) {
			this.flush();
			this.onFlush([event]);
			return;
		}

		const key = eventKey(event);
		const position = key === undefined ? undefined : this.positions.get(key);
		if (position === undefined) {
			if (key !== undefined) this.positions.set(key, this.events.length);
			this.events.push(event);
		} else {
			this.events[position] = event;
		}
		if (!this.timer) this.timer = setTimeout(() => this.flush(), this.intervalMs);
	}

	flush(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		if (this.events.length === 0) return;
		const events = this.events;
		this.events = [];
		this.positions.clear();
		this.onFlush(events);
	}

	dispose(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		this.events = [];
		this.positions.clear();
	}
}
