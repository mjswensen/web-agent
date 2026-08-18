import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { createWebAgentRuntime } from './src/server/main.js';
import { installViteWebSocketServer } from './src/server/vite-websocket.js';
import { sveltekit } from '@sveltejs/kit/vite';

/** Run the Pi/WebSocket runtime on Vite's own HTTP server during development. */
function webAgentRuntime(): Plugin {
	return {
		name: 'web-agent-runtime',
		async configureServer(vite) {
			// Vitest creates a middleware-only Vite server with no HTTP listener.
			if (!vite.httpServer) return;
			const runtime = await createWebAgentRuntime({
				argv: [],
				cwd: process.cwd()
			});
			const webSockets = installViteWebSocketServer(vite.ws, runtime.broker);
			vite.httpServer.once('close', () => {
				void webSockets.close().finally(() => runtime.close());
			});
		}
	};
}

export default defineConfig({
	server: {
		host: true,
		allowedHosts: true
	},
	plugins: [webAgentRuntime(), tailwindcss(), sveltekit()],
	test: {
		expect: { requireAssertions: true },
		reporters: ['default', './scripts/bun-exit-reporter.ts'],
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
