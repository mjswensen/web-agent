import { describe, expect, it, vi } from 'vitest';
import { RpcBroker, type PiRpcTransport } from './rpc-broker.js';
import { createBunWebSocketHub, type BunWebSocketHub } from './websocket.js';

class FakePi implements PiRpcTransport {
	readonly writes: unknown[] = [];

	async send(command: unknown): Promise<void> {
		this.writes.push(command);
	}
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

function opened(socket: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		socket.addEventListener('open', () => resolve(), { once: true });
		socket.addEventListener('error', () => reject(new Error('WebSocket failed to open.')), {
			once: true
		});
	});
}

function closed(socket: WebSocket): Promise<void> {
	return new Promise((resolve) =>
		socket.addEventListener('close', () => resolve(), { once: true })
	);
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		socket.addEventListener(
			'message',
			(event) => {
				void (async () => {
					try {
						const text =
							typeof event.data === 'string'
								? event.data
								: event.data instanceof Blob
									? await event.data.text()
									: new TextDecoder().decode(event.data);
						resolve(JSON.parse(text) as Record<string, unknown>);
					} catch (error) {
						reject(error);
					}
				})();
			},
			{ once: true }
		);
		socket.addEventListener('error', () => reject(new Error('WebSocket receive failed.')), {
			once: true
		});
	});
}

describe('/ws Bun upgrade endpoint', () => {
	it('shares one Bun.serve instance with HTTP and validates browser frames', async () => {
		const pi = new FakePi();
		const broker = new RpcBroker(pi);
		const webSockets: BunWebSocketHub = createBunWebSocketHub(broker);
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch(request, bunServer) {
				if (new URL(request.url).pathname === '/ws') {
					const upgraded = bunServer.upgrade(request);
					return upgraded ? undefined : new Response('Upgrade failed', { status: 400 });
				}
				return new Response('ok');
			},
			websocket: webSockets.handler
		});
		server.unref();
		const httpResponse = await fetch(`http://127.0.0.1:${server.port}/`);
		await expect(httpResponse.text()).resolves.toBe('ok');

		const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
		await opened(socket);
		expect(webSockets.clientCount()).toBe(1);

		const invalidResponse = nextMessage(socket);
		socket.send(JSON.stringify({ kind: 'command', id: 'invalid', command: 'nope', params: {} }));
		await expect(invalidResponse).resolves.toMatchObject({
			kind: 'response',
			id: 'invalid',
			success: false
		});

		socket.send(
			JSON.stringify({
				kind: 'command',
				id: 'prompt-1',
				command: 'prompt',
				params: { message: 'Hi' }
			})
		);
		await vi.waitFor(() => expect(pi.writes).toHaveLength(1));
		expect(pi.writes[0]).toMatchObject({ type: 'prompt', message: 'Hi' });

		const didClose = closed(socket);
		socket.close();
		await didClose;
		await webSockets.close();
		void server.stop(true);
		broker.dispose();
	});
});
