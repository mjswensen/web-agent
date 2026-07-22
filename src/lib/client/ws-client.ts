import type { AppState } from '../state/app-state.svelte.js';
import {
	parseServerFrame,
	type BrowserCommand,
	type JsonObject,
	type ResponseFrame
} from './protocol.js';

export interface WebSocketClientOptions {
	state: AppState;
	url?: string;
	webSocketFactory?: (url: string) => WebSocket;
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
	private readonly pending = new Map<
		string,
		{ resolve: (response: ResponseFrame) => void; reject: (error: Error) => void }
	>();
	private readonly webSocketFactory: (url: string) => WebSocket;

	constructor(private readonly options: WebSocketClientOptions) {
		this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
	}

	connect(): void {
		if (
			this.socket &&
			(this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)
		)
			return;
		this.options.state.setConnection('connecting');
		const socket = this.webSocketFactory(this.options.url ?? defaultUrl());
		this.socket = socket;

		socket.onopen = () => this.options.state.setConnection('connected');
		socket.onmessage = (event) => this.receive(event.data);
		socket.onerror = () => this.options.state.setConnectionError('WebSocket connection failed.');
		socket.onclose = () => {
			if (this.socket === socket) this.socket = undefined;
			this.options.state.setConnection('disconnected');
			this.rejectPending(new Error('WebSocket connection closed.'));
		};
	}

	disconnect(): void {
		this.socket?.close(1000, 'Page closed');
		this.socket = undefined;
		this.rejectPending(new Error('WebSocket client disconnected.'));
		this.options.state.setConnection('disconnected');
	}

	sendCommand(command: BrowserCommand, params: JsonObject = {}): Promise<ResponseFrame> {
		const id = createId();
		return this.sendRequest({ kind: 'command', id, command, params });
	}

	ping(): Promise<ResponseFrame> {
		const id = createId();
		return this.sendRequest({ kind: 'ping', id });
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

	private receive(data: unknown): void {
		try {
			const value = typeof data === 'string' ? JSON.parse(data) : JSON.parse(String(data));
			const frame = parseServerFrame(value);
			if (!frame) {
				this.options.state.setConnectionError('Server sent an invalid WebSocket frame.');
				return;
			}
			this.options.state.receive(frame);
			if (frame.kind === 'response') this.pendingResponse(frame);
			if (frame.kind === 'pong') {
				this.pending
					.get(frame.id)
					?.resolve({ kind: 'response', id: frame.id, command: 'ping', success: true });
				this.pending.delete(frame.id);
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
