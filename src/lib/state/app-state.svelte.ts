import type { JsonObject, JsonValue, ServerFrame } from '../client/protocol.js';
import {
	initialConversationState,
	reduceConversationEvent,
	reduceMessagesSnapshot,
	type ConversationState
} from './event-reducer.js';
import { deriveFooterValues, type FooterValues } from './footer.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type Connection = {
	status: ConnectionStatus;
	statusMessage: string | undefined;
	lastError: string | undefined;
	reconnectAttempt: number;
};

export interface QueueState {
	steering: string[];
	followUp: string[];
}

export interface LayoutState {
	toolsExpanded: boolean;
	thinkingExpanded: boolean;
	queueOpen: boolean;
}

function asObject(value: JsonValue | undefined): JsonObject | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function strings(value: JsonValue | undefined): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

function queueFrom(value: JsonValue): QueueState {
	const queue = asObject(value);
	return {
		steering: strings(queue?.steering),
		followUp: strings(queue?.followUp)
	};
}

/**
 * Per-layout client state. It is instantiated by the root layout rather than
 * exported as a singleton, preventing one SSR request from leaking into the
 * next request.
 */
export class AppState {
	connection: Connection = $state({
		status: 'disconnected',
		statusMessage: undefined,
		lastError: undefined,
		reconnectAttempt: 0
	});

	snapshots = $state<Record<string, JsonValue>>({});
	conversation: ConversationState = $state(initialConversationState());
	queue: QueueState = $state({ steering: [], followUp: [] });
	layout: LayoutState = $state({ toolsExpanded: false, thinkingExpanded: false, queueOpen: false });
	lastEvent = $state<JsonValue | undefined>(undefined);

	get sessionState(): JsonObject | undefined {
		return asObject(this.snapshots.state);
	}

	get isAgentActive(): boolean {
		return this.conversation.isStreaming || this.sessionState?.isStreaming === true;
	}

	get sessionName(): string | undefined {
		const state = this.sessionState;
		return typeof state?.sessionName === 'string' ? state.sessionName : undefined;
	}

	get footer(): FooterValues {
		return deriveFooterValues(this.snapshots.state, this.snapshots.footer_stats);
	}

	get hasQueuedMessages(): boolean {
		return this.queue.steering.length > 0 || this.queue.followUp.length > 0;
	}

	setConnection(status: ConnectionStatus, statusMessage?: string): void {
		this.connection.status = status;
		this.connection.statusMessage = statusMessage;
		if (status === 'connected') {
			this.connection.lastError = undefined;
			this.connection.reconnectAttempt = 0;
		}
	}

	setReconnectAttempt(attempt: number): void {
		this.connection.reconnectAttempt = attempt;
	}

	setConnectionError(error: string): void {
		this.connection.status = 'disconnected';
		this.connection.lastError = error;
	}

	setToolsExpanded(expanded: boolean): void {
		this.layout.toolsExpanded = expanded;
	}

	setThinkingExpanded(expanded: boolean): void {
		this.layout.thinkingExpanded = expanded;
	}

	toggleQueue(): void {
		this.layout.queueOpen = !this.layout.queueOpen;
	}

	private applyEvent(event: JsonObject): void {
		this.lastEvent = event;
		this.conversation = reduceConversationEvent(this.conversation, event);
		if (event.type === 'queue_update') this.queue = queueFrom(event);
	}

	receive(frame: ServerFrame): void {
		if (frame.kind === 'snapshot') {
			this.snapshots[frame.snapshotType] = frame.data;
			if (frame.snapshotType === 'messages') this.conversation = reduceMessagesSnapshot(frame.data);
			if (frame.snapshotType === 'queue') this.queue = queueFrom(frame.data);
			return;
		}
		if (frame.kind === 'event') {
			this.applyEvent(frame.event);
			return;
		}
		if (frame.kind === 'events') {
			for (const event of frame.events) this.applyEvent(event);
			return;
		}
		if (frame.kind === 'server_status') {
			this.connection.statusMessage = frame.message ?? frame.status;
			if (frame.status === 'pi_unavailable')
				this.setConnectionError(frame.message ?? 'Pi is unavailable.');
		}
	}
}
