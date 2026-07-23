import type { AppState } from '../state/app-state.svelte.js';
import {
	parseServerFrame,
	type BrowserCommand,
	type JsonObject,
	type JsonValue,
	type ResponseFrame,
	type ServerFrame
} from './protocol.js';

export interface WebSocketClientOptions {
	state: AppState;
	url?: string;
	webSocketFactory?: (url: string) => WebSocket;
}

const bootstrapCommands: BrowserCommand[] = [
	'get_state',
	'get_messages',
	'get_commands',
	'get_session_stats',
	'get_session_list'
];

function frameEvents(frame: ServerFrame): JsonObject[] {
	return frame.kind === 'event' ? [frame.event] : frame.kind === 'events' ? frame.events : [];
}

function needsFooterRefresh(frame: ServerFrame): boolean {
	return frameEvents(frame).some(
		(event) =>
			event.type === 'agent_end' ||
			event.type === 'agent_settled' ||
			event.type === 'compaction_end'
	);
}

function needsSessionRefresh(frame: ServerFrame): boolean {
	return frameEvents(frame).some((event) => event.type === 'session_changed');
}

function createId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`client-${Date.now()}-${Math.random().toString(16).slice(2)}`
	);
}

function defaultUrl(): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${window.location.host}/ws`;
}

/** Browser-only WebSocket client. Call connect from onMount, never during SSR. */
export class WebAgentWebSocketClient {
	private socket: WebSocket | undefined;
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	private reconnectAttempt = 0;
	private shouldReconnect = true;
	private readonly pending = new Map<
		string,
		{ resolve: (response: ResponseFrame) => void; reject: (error: Error) => void }
	>();
	private readonly webSocketFactory: (url: string) => WebSocket;

	constructor(private readonly options: WebSocketClientOptions) {
		this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
	}

	connect(): void {
		this.shouldReconnect = true;
		this.open();
	}

	disconnect(): void {
		this.shouldReconnect = false;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		this.socket?.close(1000, 'Page closed');
		this.socket = undefined;
		this.rejectPending(new Error('WebSocket client disconnected.'));
		this.options.state.setConnection('disconnected');
	}

	sendCommand(command: BrowserCommand, params: JsonObject = {}): Promise<ResponseFrame> {
		const id = createId();
		return this.sendRequest({ kind: 'command', id, command, params });
	}

	sendDialogResponse(
		id: string,
		response: { value?: JsonValue; confirmed?: boolean; cancelled?: true }
	): void {
		this.sendFrame({ kind: 'dialog_response', id, ...response });
	}

	ping(): Promise<ResponseFrame> {
		const id = createId();
		return this.sendRequest({ kind: 'ping', id });
	}

	private open(): void {
		if (
			this.socket &&
			(this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)
		)
			return;
		this.options.state.setConnection('connecting');
		const socket = this.webSocketFactory(this.options.url ?? defaultUrl());
		this.socket = socket;

		socket.onopen = () => {
			if (this.socket !== socket) return;
			this.reconnectAttempt = 0;
			this.options.state.setConnection('connected');
			void this.bootstrap();
		};
		socket.onmessage = (event) => this.receive(event.data);
		socket.onerror = () => this.options.state.setConnectionError('WebSocket connection failed.');
		socket.onclose = () => {
			if (this.socket === socket) this.socket = undefined;
			this.options.state.setConnection('disconnected');
			this.rejectPending(new Error('WebSocket connection closed.'));
			this.scheduleReconnect();
		};
	}

	private async bootstrap(): Promise<void> {
		for (const command of bootstrapCommands) {
			try {
				const response = await this.sendCommand(command);
				if (!response.success)
					this.options.state.setConnectionError(response.error ?? `Unable to ${command}.`);
			} catch {
				// A close handler already surfaces connectivity failures and schedules retry.
				return;
			}
		}
	}

	private async refreshFooter(): Promise<void> {
		try {
			await Promise.all([this.sendCommand('get_state'), this.sendCommand('get_session_stats')]);
		} catch {
			// Connection close/reconnect handles the visible error state.
		}
	}

	private async refreshSession(): Promise<void> {
		try {
			await Promise.all([
				this.sendCommand('get_state'),
				this.sendCommand('get_messages'),
				this.sendCommand('get_commands'),
				this.sendCommand('get_session_stats'),
				this.sendCommand('get_session_list')
			]);
		} catch {
			// Connection close/reconnect handles the visible error state.
		}
	}

	private scheduleReconnect(): void {
		if (!this.shouldReconnect || this.reconnectTimer) return;
		this.reconnectAttempt += 1;
		this.options.state.setReconnectAttempt(this.reconnectAttempt);
		const exponentialDelay = Math.min(10_000, 250 * 2 ** (this.reconnectAttempt - 1));
		const jitter = Math.floor(Math.random() * Math.min(250, exponentialDelay / 4));
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.open();
		}, exponentialDelay + jitter);
	}

	private sendRequest(frame: JsonObject): Promise<ResponseFrame> {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error('WebSocket is not connected.'));
		}
		return new Promise<ResponseFrame>((resolve, reject) => {
			this.pending.set(frame.id as string, { resolve, reject });
			this.socket!.send(JSON.stringify(frame));
		});
	}

	private sendFrame(frame: JsonObject): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket is not connected.');
		}
		this.socket.send(JSON.stringify(frame));
	}

	private receive(data: unknown): void {
		try {
			const value = typeof data === 'string' ? JSON.parse(data) : JSON.parse(String(data));
			const frame = parseServerFrame(value);
			if (!frame) {
				this.options.state.setConnectionError('Server sent an invalid WebSocket frame.');
				return;
			}
			this.options.state.receive(frame);
			if (needsFooterRefresh(frame)) void this.refreshFooter();
			if (needsSessionRefresh(frame)) void this.refreshSession();
			if (frame.kind === 'response') this.pendingResponse(frame);
			if (frame.kind === 'pong') {
				this.pending
					.get(frame.id)
					?.resolve({ kind: 'response', id: frame.id, command: 'ping', success: true });
				this.pending.delete(frame.id);
			}
			if (frame.kind === 'server_status' && frame.status === 'server_shutting_down') {
				this.shouldReconnect = false;
			}
		} catch {
			this.options.state.setConnectionError('Server sent malformed JSON.');
		}
	}

	private pendingResponse(frame: ResponseFrame): void {
		const pending = this.pending.get(frame.id);
		if (!pending) return;
		this.pending.delete(frame.id);
		pending.resolve(frame);
	}

	private rejectPending(error: Error): void {
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}
}
