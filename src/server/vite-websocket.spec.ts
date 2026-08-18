import type { WebSocketClient, WebSocketServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { RpcBroker, type PiRpcTransport } from './rpc-broker.js';
import { installViteWebSocketServer } from './vite-websocket.js';

class FakePi implements PiRpcTransport {
	async send(): Promise<void> {}
	onRecord(): () => void {
		return () => undefined;
	}
	onProtocolError(): () => void {
		return () => undefined;
	}
	onExit(): () => void {
		return () => undefined;
	}
}

class FakeViteChannel {
	private readonly listeners = new Map<
		string,
		Set<(data: unknown, client: WebSocketClient) => void>
	>();

	on(event: string, listener: (data: unknown, client: WebSocketClient) => void): void {
		let listeners = this.listeners.get(event);
		if (!listeners) this.listeners.set(event, (listeners = new Set()));
		listeners.add(listener);
	}

	off(event: string, listener: (data: unknown, client: WebSocketClient) => void): void {
		this.listeners.get(event)?.delete(listener);
	}

	emit(event: string, data: unknown, client: WebSocketClient): void {
		for (const listener of this.listeners.get(event) ?? []) listener(data, client);
	}
}

describe('Vite HMR broker bridge', () => {
	it('connects, exchanges frames, and disconnects without another upgrade endpoint', async () => {
		const channel = new FakeViteChannel();
		const broker = new RpcBroker(new FakePi());
		const hub = installViteWebSocketServer(channel as unknown as WebSocketServer, broker);
		const send = vi.fn();
		const client = { socket: {}, send } as unknown as WebSocketClient;
		const connection = { connectionId: 'tab-1' };

		channel.emit('web-agent:connect', connection, client);
		expect(hub.clientCount()).toBe(1);
		expect(send).toHaveBeenCalledWith('web-agent:open', connection);

		channel.emit(
			'web-agent:message',
			{ ...connection, text: JSON.stringify({ kind: 'ping', id: 'ping-1' }) },
			client
		);
		await vi.waitFor(() =>
			expect(send).toHaveBeenCalledWith('web-agent:frame', {
				...connection,
				text: JSON.stringify({ kind: 'pong', id: 'ping-1' })
			})
		);

		channel.emit('web-agent:disconnect', connection, client);
		expect(hub.clientCount()).toBe(0);
		await hub.close();
		broker.dispose();
	});
});
