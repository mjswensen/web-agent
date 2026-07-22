import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { RpcBroker, type PiRpcTransport } from './rpc-broker.js';
import { installWebSocketServer } from './websocket.js';

class FakePi implements PiRpcTransport {
	readonly writes: unknown[] = [];
	private recordListener: ((record: unknown) => void) | undefined;

	async send(command: unknown): Promise<void> {
		this.writes.push(command);
	}
	onRecord(listener: (record: unknown) => void): () => void {
		this.recordListener = listener;
		return () => undefined;
	}
	onProtocolError(): () => void {
		return () => undefined;
	}
	onExit(): () => void {
		return () => undefined;
	}
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		socket.once('message', (data) => resolve(JSON.parse(data.toString('utf8'))));
		socket.once('error', reject);
	});
}

describe('/ws upgrade endpoint', () => {
	it('validates browser frames and forwards valid commands through the broker', async () => {
		const pi = new FakePi();
		const broker = new RpcBroker(pi);
		const server = createServer((_request, response) => response.end('ok'));
		const webSockets = installWebSocketServer(server, broker);
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Expected TCP test server.');
		const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
		await once(socket, 'open');

		socket.send(JSON.stringify({ kind: 'command', id: 'invalid', command: 'nope', params: {} }));
		await expect(nextMessage(socket)).resolves.toMatchObject({
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

		socket.close();
		await once(socket, 'close');
		await webSockets.close();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	});
});
