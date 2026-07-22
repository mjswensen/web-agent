import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { parseClientFrame, type ServerFrame } from '../lib/client/protocol.js';
import type { RpcBroker } from './rpc-broker.js';

export interface WebSocketHub {
	close(): Promise<void>;
	clientCount(): number;
}

function parseMessage(data: RawData): unknown {
	const text = Array.isArray(data)
		? Buffer.concat(data).toString('utf8')
		: data instanceof ArrayBuffer
			? Buffer.from(data).toString('utf8')
			: data.toString('utf8');
	return JSON.parse(text);
}

function send(socket: WebSocket, frame: ServerFrame): void {
	if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

function requestPath(request: IncomingMessage): string | undefined {
	if (!request.url) return undefined;
	try {
		return new URL(request.url, 'http://localhost').pathname;
	} catch {
		return undefined;
	}
}

/** Installs the sole `/ws` upgrade endpoint on the SvelteKit-owned HTTP server. */
export function installWebSocketServer(
	server: {
		on(
			event: 'upgrade',
			listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void
		): unknown;
	},
	broker: RpcBroker,
	path = '/ws'
): WebSocketHub {
	const webSocketServer = new WebSocketServer({ noServer: true });
	const sockets = new Set<WebSocket>();

	server.on('upgrade', (request, socket, head) => {
		if (requestPath(request) !== path) {
			socket.destroy();
			return;
		}
		webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
			webSocketServer.emit('connection', webSocket, request);
		});
	});

	webSocketServer.on('connection', (socket) => {
		const clientId = randomUUID();
		sockets.add(socket);
		const removeClient = broker.addClient({ id: clientId, send: (frame) => send(socket, frame) });

		socket.on('message', async (data) => {
			let value: unknown;
			try {
				value = parseMessage(data);
			} catch {
				// There is no request ID to correlate for malformed JSON, so it is
				// deliberately ignored rather than fabricating a Pi status failure.
				return;
			}

			const parsed = parseClientFrame(value);
			if (!parsed.ok) {
				if (parsed.id) {
					send(socket, {
						kind: 'response',
						id: parsed.id,
						command: parsed.command ?? 'unknown',
						success: false,
						error: parsed.error
					});
				}
				return;
			}

			await broker.handleClientFrame(clientId, parsed.frame);
		});
		socket.once('close', () => {
			sockets.delete(socket);
			removeClient();
		});
		socket.once('error', () => socket.close());
	});

	return {
		clientCount: () => sockets.size,
		close: async () => {
			for (const socket of sockets) socket.close(1001, 'Server shutting down');
			await new Promise<void>((resolve, reject) => {
				webSocketServer.close((error) => (error ? reject(error) : resolve()));
			});
		}
	};
}
