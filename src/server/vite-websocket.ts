import type { WebSocketClient, WebSocketServer } from 'vite';
import type { RpcBroker } from './rpc-broker.js';
import { connectBrowserClient, type BrowserConnection, type WebSocketHub } from './websocket.js';

interface ChannelPayload {
	connectionId: string;
	text?: string;
}

type Socket = WebSocketClient['socket'];

function payload(value: unknown): ChannelPayload | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const candidate = value as Record<string, unknown>;
	if (
		typeof candidate.connectionId !== 'string' ||
		candidate.connectionId.length === 0 ||
		candidate.connectionId.length > 200
	) {
		return undefined;
	}
	if (candidate.text !== undefined && typeof candidate.text !== 'string') return undefined;
	return {
		connectionId: candidate.connectionId,
		...(typeof candidate.text === 'string' ? { text: candidate.text } : {})
	};
}

/**
 * Development-only broker bridge over Vite's existing HMR channel. Reusing the
 * channel avoids a second upgrade listener while leaving HMR traffic untouched.
 */
export function installViteWebSocketServer(
	server: WebSocketServer,
	broker: RpcBroker
): WebSocketHub {
	const sockets = new Map<Socket, Map<string, BrowserConnection>>();

	const onConnect = (value: unknown, client: WebSocketClient) => {
		const frame = payload(value);
		if (!frame) return;
		let connections = sockets.get(client.socket);
		if (!connections) {
			connections = new Map();
			sockets.set(client.socket, connections);
		}
		if (!connections.has(frame.connectionId)) {
			connections.set(
				frame.connectionId,
				connectBrowserClient(broker, crypto.randomUUID(), (text) => {
					client.send('web-agent:frame', { connectionId: frame.connectionId, text });
				})
			);
		}
		client.send('web-agent:open', { connectionId: frame.connectionId });
	};

	const onMessage = (value: unknown, client: WebSocketClient) => {
		const frame = payload(value);
		if (frame?.text === undefined) return;
		void sockets.get(client.socket)?.get(frame.connectionId)?.receive(frame.text);
	};

	const onDisconnect = (value: unknown, client: WebSocketClient) => {
		const frame = payload(value);
		if (!frame) return;
		const connections = sockets.get(client.socket);
		connections?.get(frame.connectionId)?.close();
		connections?.delete(frame.connectionId);
		if (connections?.size === 0) sockets.delete(client.socket);
	};

	const onSocketClose = (_value: unknown, client: WebSocketClient) => {
		for (const connection of sockets.get(client.socket)?.values() ?? []) connection.close();
		sockets.delete(client.socket);
	};

	server.on('web-agent:connect', onConnect);
	server.on('web-agent:message', onMessage);
	server.on('web-agent:disconnect', onDisconnect);
	server.on('vite:client:disconnect', onSocketClose);

	return {
		clientCount: () => {
			let count = 0;
			for (const connections of sockets.values()) count += connections.size;
			return count;
		},
		close: async () => {
			server.off('web-agent:connect', onConnect);
			server.off('web-agent:message', onMessage);
			server.off('web-agent:disconnect', onDisconnect);
			server.off('vite:client:disconnect', onSocketClose);
			for (const connections of sockets.values()) {
				for (const connection of connections.values()) connection.close();
			}
			sockets.clear();
		}
	};
}
