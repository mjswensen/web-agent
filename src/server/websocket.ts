import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { parseClientFrame, type ServerFrame } from '../lib/client/protocol.js';
import type { RpcBroker } from './rpc-broker.js';

export interface WebSocketHub {
	close(): Promise<void>;
	clientCount(): number;
}

export interface BrowserConnection {
	receive(text: string): Promise<void>;
	close(): void;
}

function sendFrame(send: (text: string) => void, frame: ServerFrame): void {
	send(JSON.stringify(frame));
}

/** Connects an already-upgraded socket to the transport-independent RPC broker. */
export function connectBrowserClient(
	broker: RpcBroker,
	clientId: string,
	send: (text: string) => void
): BrowserConnection {
	const removeClient = broker.addClient({
		id: clientId,
		send: (frame) => sendFrame(send, frame)
	});
	let connected = true;

	return {
		async receive(text) {
			if (!connected) return;
			let value: unknown;
			try {
				value = JSON.parse(text);
			} catch {
				// Malformed JSON has no trustworthy request ID to correlate.
				return;
			}

			const parsed = parseClientFrame(value);
			if (!parsed.ok) {
				if (parsed.id) {
					sendFrame(send, {
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
		},
		close() {
			if (!connected) return;
			connected = false;
			removeClient();
		}
	};
}

function decodeMessage(message: string | Uint8Array): string {
	return typeof message === 'string' ? message : new TextDecoder().decode(message);
}

export interface BunWebSocketHub extends WebSocketHub {
	readonly handler: WebSocketHandler<unknown>;
}

/** Creates the sole production `/ws` handler used by Bun.serve. */
export function createBunWebSocketHub(broker: RpcBroker): BunWebSocketHub {
	const connections = new Map<ServerWebSocket<unknown>, BrowserConnection>();

	const handler: WebSocketHandler<unknown> = {
		open(socket: ServerWebSocket<unknown>) {
			const connection = connectBrowserClient(broker, crypto.randomUUID(), (text) => {
				try {
					socket.send(text);
				} catch {
					socket.close(1011, 'WebSocket send failed');
				}
			});
			connections.set(socket, connection);
		},
		async message(socket: ServerWebSocket<unknown>, message: string | Buffer) {
			await connections.get(socket)?.receive(decodeMessage(message));
		},
		close(socket: ServerWebSocket<unknown>) {
			connections.get(socket)?.close();
			connections.delete(socket);
		}
	};

	return {
		handler,
		clientCount: () => connections.size,
		close: async () => {
			for (const [socket, connection] of connections) {
				connection.close();
				socket.close(1001, 'Server shutting down');
			}
			connections.clear();
		}
	};
}
