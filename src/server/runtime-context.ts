import type { WebAgentRuntime } from './main.js';

const runtimeKey = '__webAgentRuntime__';
type RuntimeGlobal = typeof globalThis & { [runtimeKey]?: WebAgentRuntime };

export function setWebAgentRuntime(runtime: WebAgentRuntime): void {
	(globalThis as RuntimeGlobal)[runtimeKey] = runtime;
}

export function getWebAgentRuntime(): WebAgentRuntime | undefined {
	return (globalThis as RuntimeGlobal)[runtimeKey];
}

export function clearWebAgentRuntime(runtime: WebAgentRuntime): void {
	const state = globalThis as RuntimeGlobal;
	if (state[runtimeKey] === runtime) delete state[runtimeKey];
}
