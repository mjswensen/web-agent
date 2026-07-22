import type { JsonValue, ServerFrame } from '../client/protocol.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type Connection = {
	status: ConnectionStatus;
	statusMessage: string | undefined;
	lastError: string | undefined;
};

/**
 * Per-layout client state. It is instantiated by the root layout rather than
 * exported as a singleton, preventing one SSR request from leaking into the
 * next request.
 */
export class AppState {
	connection: Connection = $state({
		status: 'disconnected',
		statusMessage: undefined,
		lastError: undefined
	});

	snapshots = $state<Record<string, JsonValue>>({});
	lastEvent = $state<JsonValue | undefined>(undefined);

	setConnection(status: ConnectionStatus, statusMessage?: string): void {
		this.connection.status = status;
		this.connection.statusMessage = statusMessage;
		if (status !== 'disconnected') this.connection.lastError = undefined;
	}

	setConnectionError(error: string): void {
		this.connection.status = 'disconnected';
		this.connection.lastError = error;
	}

	receive(frame: ServerFrame): void {
		if (frame.kind === 'snapshot') {
			this.snapshots[frame.snapshotType] = frame.data;
			return;
		}
		if (frame.kind === 'event') {
			this.lastEvent = frame.event;
			return;
		}
		if (frame.kind === 'server_status')
			this.connection.statusMessage = frame.message ?? frame.status;
	}
}
