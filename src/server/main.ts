import { DefaultGitStatusProvider } from './git-status.js';
import { RpcBroker } from './rpc-broker.js';
import { type PiLifecycleOptions } from './pi-lifecycle.js';
import { PiSupervisor } from './pi-supervisor.js';
import { createBunWebSocketHub, type BunWebSocketHub } from './websocket.js';

export interface WebAgentRuntime {
	broker: RpcBroker;
	supervisor: PiSupervisor;
	webSockets: BunWebSocketHub;
	close(): Promise<void>;
}

/** Composes one restartable Pi child, one broker, and Bun's `/ws` handler. */
export async function createWebAgentRuntime(
	piOptions: PiLifecycleOptions
): Promise<WebAgentRuntime> {
	const supervisor = new PiSupervisor(piOptions);
	const piProcess = await supervisor.start();
	const broker = new RpcBroker(piProcess, {
		cwd: piOptions.cwd,
		sessionList: supervisor.sessionList,
		gitStatus: new DefaultGitStatusProvider({ cwd: piOptions.cwd ?? process.cwd() }),
		restartPi: () => supervisor.restart()
	});
	const webSockets = createBunWebSocketHub(broker);
	let closing: Promise<void> | undefined;

	return {
		broker,
		supervisor,
		webSockets,
		close: () => {
			closing ??= (async () => {
				broker.announceStatus('server_shutting_down');
				await webSockets.close();
				await supervisor.stop(250);
				broker.dispose();
			})();
			return closing;
		}
	};
}
