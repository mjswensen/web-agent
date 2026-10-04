import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { McpConfigController } from './mcp-config.js';
import { AuthController } from './auth-controller.js';
import { DefaultGitStatusProvider } from './git-status.js';
import { RpcBroker } from './rpc-broker.js';
import { createSdkRuntime, type SdkRuntimeOwner } from './sdk-runtime.js';
import { SdkTransport } from './sdk-transport.js';
import { createBunWebSocketHub, type BunWebSocketHub } from './websocket.js';
import type { SdkStartupOptions } from './cli.js';
import { BunTerminalProvider } from './terminal-provider.js';

export interface WebAgentRuntime {
	broker: RpcBroker;
	sdk: SdkRuntimeOwner;
	webSockets: BunWebSocketHub;
	close(): Promise<void>;
}

/** Composes one embedded SDK runtime, one broker, and Bun's `/ws` handler. */
export interface WebAgentRuntimeOptions {
	webAuthEnabled?: boolean;
	webAuthDisabledReason?: string;
	terminalEnabled?: boolean;
}

export async function createWebAgentRuntime(
	startup: SdkStartupOptions,
	cwd = process.cwd(),
	options: WebAgentRuntimeOptions = {}
): Promise<WebAgentRuntime> {
	const sdk = await createSdkRuntime(startup, cwd);
	const transport = new SdkTransport(
		sdk.runtime,
		new McpConfigController(getAgentDir(), options.webAuthEnabled ?? true)
	);
	const auth = new AuthController(
		sdk.modelRuntime,
		() => sdk.runtime.session,
		options.webAuthEnabled ?? true,
		options.webAuthDisabledReason
	);
	const broker = new RpcBroker(transport, {
		cwd: sdk.launchCwd,
		sessionList: sdk.sessionList,
		gitStatus: new DefaultGitStatusProvider({ cwd: sdk.launchCwd }),
		auth,
		terminal: options.terminalEnabled ? new BunTerminalProvider(sdk.launchCwd) : undefined,
		agentStatus: sdk.availability === 'unconfigured' ? 'unconfigured' : 'ready'
	});
	const webSockets = createBunWebSocketHub(broker);
	let closing: Promise<void> | undefined;
	for (const diagnostic of sdk.diagnostics)
		console.error(`[${diagnostic.type}] ${diagnostic.message}`);

	return {
		broker,
		sdk,
		webSockets,
		close: () => {
			closing ??= (async () => {
				broker.announceStatus('server_shutting_down');
				await webSockets.close();
				await sdk.close();
				transport.dispose();
				broker.dispose();
			})();
			return closing;
		}
	};
}
