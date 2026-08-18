interface ViteHotChannel {
	send(event: string, data?: unknown): void;
	on(event: string, callback: (data: unknown) => void): void;
	off(event: string, callback: (data: unknown) => void): void;
}

interface HotEnvelope {
	connectionId: string;
	text?: string;
}

function envelope(value: unknown): HotEnvelope | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.connectionId !== 'string') return undefined;
	if (candidate.text !== undefined && typeof candidate.text !== 'string') return undefined;
	return {
		connectionId: candidate.connectionId,
		...(typeof candidate.text === 'string' ? { text: candidate.text } : {})
	};
}

/** WebSocket-shaped client that tunnels development frames over Vite HMR. */
export class ViteHotSocket {
	readonly connectionId = crypto.randomUUID();
	readyState: number = WebSocket.CONNECTING;
	onopen: WebSocket['onopen'] = null;
	onmessage: WebSocket['onmessage'] = null;
	onerror: WebSocket['onerror'] = null;
	onclose: WebSocket['onclose'] = null;
	private connectTimer: ReturnType<typeof setInterval> | undefined;

	private readonly handleOpen = (value: unknown) => {
		const frame = envelope(value);
		if (frame?.connectionId !== this.connectionId || this.readyState !== WebSocket.CONNECTING) {
			return;
		}
		this.clearConnectTimer();
		this.readyState = WebSocket.OPEN;
		this.onopen?.call(this as unknown as WebSocket, new Event('open'));
	};

	private readonly handleMessage = (value: unknown) => {
		const frame = envelope(value);
		if (
			frame?.connectionId !== this.connectionId ||
			frame.text === undefined ||
			this.readyState !== WebSocket.OPEN
		) {
			return;
		}
		this.onmessage?.call(
			this as unknown as WebSocket,
			new MessageEvent('message', { data: frame.text })
		);
	};

	private readonly handleHmrDisconnect = () => {
		if (this.readyState === WebSocket.CLOSED) return;
		this.finishClose(1006, 'Vite HMR disconnected');
	};

	constructor(private readonly hot: ViteHotChannel) {
		hot.on('web-agent:open', this.handleOpen);
		hot.on('web-agent:frame', this.handleMessage);
		hot.on('vite:ws:disconnect', this.handleHmrDisconnect);
		const connect = () => {
			if (this.readyState === WebSocket.CONNECTING) {
				hot.send('web-agent:connect', {
					connectionId: this.connectionId
				} satisfies HotEnvelope);
			}
		};
		queueMicrotask(connect);
		this.connectTimer = setInterval(connect, 250);
	}

	send(text: string): void {
		if (this.readyState !== WebSocket.OPEN) throw new Error('WebSocket is not connected.');
		this.hot.send('web-agent:message', {
			connectionId: this.connectionId,
			text
		} satisfies HotEnvelope);
	}

	close(code = 1000, reason = ''): void {
		if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) return;
		this.readyState = WebSocket.CLOSING;
		this.hot.send('web-agent:disconnect', {
			connectionId: this.connectionId
		} satisfies HotEnvelope);
		this.finishClose(code, reason);
	}

	private finishClose(code: number, reason: string): void {
		this.clearConnectTimer();
		this.hot.off('web-agent:open', this.handleOpen);
		this.hot.off('web-agent:frame', this.handleMessage);
		this.hot.off('vite:ws:disconnect', this.handleHmrDisconnect);
		this.readyState = WebSocket.CLOSED;
		this.onclose?.call(
			this as unknown as WebSocket,
			new CloseEvent('close', { code, reason, wasClean: code === 1000 })
		);
	}

	private clearConnectTimer(): void {
		if (this.connectTimer) clearInterval(this.connectTimer);
		this.connectTimer = undefined;
	}
}

export function createViteHotSocket(hot: ViteHotChannel): WebSocket {
	return new ViteHotSocket(hot) as unknown as WebSocket;
}
