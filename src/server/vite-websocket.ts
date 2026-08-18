import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { Buffer } from 'node:buffer';
import type { HttpServer } from 'vite';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { RpcBroker } from './rpc-broker.js';
import { connectBrowserClient, type WebSocketHub } from './websocket.js';

function parseMessage(data: RawData): string {
	if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
	if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
	return data.toString('utf8');
}

function requestPath(request: IncomingMessage): string | undefined {
	if (!request.url) return undefined;
	try {
		return new URL(request.url, 'http://localhost').pathname;
	} catch {
		return undefined;
	}
}

/**
 * Development-only bridge for Vite's Node-compatible listener. Non-application
 * upgrades are left to Vite, so its HMR WebSocket remains unaffected.
 */
export function installViteWebSocketServer(
	server: HttpServer,
	broker: RpcBroker,
	path = '/ws'
): WebSocketHub {
	const webSocketServer = new WebSocketServer({ noServer: true });
	const sockets = new Map<WebSocket, ReturnType<typeof connectBrowserClient>>();

	(server as Server).on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
		if (requestPath(request) !== path) return;
		webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
			webSocketServer.emit('connection', webSocket, request);
		});
	});

	webSocketServer.on('connection', (socket) => {
		const connection = connectBrowserClient(broker, crypto.randomUUID(), (text) => {
			if (socket.readyState === WebSocket.OPEN) socket.send(text);
		});
		sockets.set(socket, connection);
		socket.on('message', (data) => void connection.receive(parseMessage(data)));
		socket.once('close', () => {
			connection.close();
			sockets.delete(socket);
		});
		socket.once('error', () => socket.close());
	});

	return {
		clientCount: () => sockets.size,
		close: async () => {
			for (const [socket, connection] of sockets) {
				connection.close();
				socket.close(1001, 'Server shutting down');
			}
			sockets.clear();
			await new Promise<void>((resolve, reject) => {
				webSocketServer.close((error) => (error ? reject(error) : resolve()));
			});
		}
	};
}
