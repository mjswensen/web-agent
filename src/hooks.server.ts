import type { Handle } from '@sveltejs/kit';
import { getWebAgentRuntime } from './server/runtime-context.js';

function isApplicationUpgrade(request: Request): boolean {
	let pathname: string;
	try {
		pathname = new URL(request.url).pathname;
	} catch {
		return false;
	}
	return (
		pathname === '/ws' &&
		request.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
		request.headers
			.get('connection')
			?.split(',')
			.some((value) => value.trim().toLowerCase() === 'upgrade') === true
	);
}

/** Marks only `/ws` for upgrade on adapter-bun's existing Bun.serve instance. */
export const handle: Handle = async ({ event, resolve }) => {
	const runtime = getWebAgentRuntime();
	const platform = event.platform;
	if (runtime && platform && isApplicationUpgrade(platform.originalRequest)) {
		return platform.markForUpgrade(
			new Response('WebSocket upgrade failed.', { status: 400 }),
			runtime.webSockets.handler
		);
	}
	return resolve(event);
};
