import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RpcBroker } from './rpc-broker.js';
import { installWebSocketServer, type WebSocketHub } from './websocket.js';

export type SvelteKitRequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

export interface WebAgentHttpServer {
	server: Server;
	webSockets: WebSocketHub;
	listen(host: string, port: number): Promise<AddressInfo>;
	close(): Promise<void>;
}

/**
 * Creates the single HTTP server that serves SvelteKit and upgrades `/ws`.
 * The production entry point supplies adapter-node's generated request handler;
 * keeping this factory dependency-free makes the shared-server guarantee easy
 * to test without building the app.
 */
export function createWebAgentHttpServer(
	handler: SvelteKitRequestHandler,
	broker: RpcBroker
): WebAgentHttpServer {
	const server = createServer(handler);
	const webSockets = installWebSocketServer(server, broker);

	return {
		server,
		webSockets,
		listen: (host, port) =>
			new Promise<AddressInfo>((resolve, reject) => {
				const onError = (error: Error) => {
					server.off('listening', onListening);
					reject(error);
				};
				const onListening = () => {
					server.off('error', onError);
					resolve(server.address() as AddressInfo);
				};
				server.once('error', onError);
				server.once('listening', onListening);
				server.listen(port, host);
			}),
		close: async () => {
			broker.announceStatus('server_shutting_down');
			await webSockets.close();
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}
	};
}
