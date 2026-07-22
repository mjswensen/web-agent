import type { JsonObject, JsonValue, ServerFrame } from '../client/protocol.js';
import {
	initialConversationState,
	reduceConversationEvent,
	reduceMessagesSnapshot,
	type ConversationState
} from './event-reducer.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type Connection = {
	status: ConnectionStatus;
	statusMessage: string | undefined;
	lastError: string | undefined;
	reconnectAttempt: number;
};

function asObject(value: JsonValue | undefined): JsonObject | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
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

	receive(frame: ServerFrame): void {
		if (frame.kind === 'snapshot') {
			this.snapshots[frame.snapshotType] = frame.data;
			if (frame.snapshotType === 'messages') this.conversation = reduceMessagesSnapshot(frame.data);
			return;
		}
		if (frame.kind === 'event') {
			this.lastEvent = frame.event;
			this.conversation = reduceConversationEvent(this.conversation, frame.event);
			return;
		}
		if (frame.kind === 'events') {
			for (const event of frame.events) {
				this.lastEvent = event;
				this.conversation = reduceConversationEvent(this.conversation, event);
			}
			return;
		}
		if (frame.kind === 'server_status') {
			this.connection.statusMessage = frame.message ?? frame.status;
			if (frame.status === 'pi_unavailable')
				this.setConnectionError(frame.message ?? 'Pi is unavailable.');
		}
	}
}
