import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RpcBroker } from './rpc-broker.js';
import { type PiLifecycleOptions } from './pi-lifecycle.js';
import { PiSupervisor } from './pi-supervisor.js';
import { installWebSocketServer, type WebSocketHub } from './websocket.js';

export type SvelteKitRequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

export interface WebAgentHttpServer {
	server: Server;
	webSockets: WebSocketHub;
	listen(host: string, port: number): Promise<AddressInfo>;
	close(): Promise<void>;
}

export interface WebAgentRuntime extends WebAgentHttpServer {
	broker: RpcBroker;
	supervisor: PiSupervisor;
}

/** Bind the requested port, moving upward when a local port is already occupied. */
export async function listenOnAvailablePort(
	http: Pick<WebAgentHttpServer, 'listen'>,
	host: string,
	requestedPort: number
): Promise<AddressInfo> {
	for (let port = requestedPort; port <= 65_535; port += 1) {
		try {
			return await http.listen(host, port);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === 65_535) throw error;
		}
	}
	throw new Error('No available local TCP port was found.');
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

/**
 * Composes the shared HTTP/WebSocket server with one restartable Pi child.
 * A production entry point supplies adapter-node's handler and this runtime
 * keeps the server alive when Pi exits so the browser can offer recovery.
 */
export async function createWebAgentRuntime(
	handler: SvelteKitRequestHandler,
	piOptions: PiLifecycleOptions
): Promise<WebAgentRuntime> {
	const supervisor = new PiSupervisor(piOptions);
	const process = await supervisor.start();
	const broker = new RpcBroker(process, {
		sessionList: supervisor.sessionList,
		restartPi: () => supervisor.restart()
	});
	const http = createWebAgentHttpServer(handler, broker);
	return {
		...http,
		broker,
		supervisor,
		close: async () => {
			await http.close();
			await supervisor.stop(250);
			broker.dispose();
		}
	};
}
