import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { attachWebAgentRuntime } from './src/server/main.js';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

/** Run the Pi/WebSocket runtime on Vite's own HTTP server during development. */
function webAgentRuntime(): Plugin {
	return {
		name: 'web-agent-runtime',
		async configureServer(vite) {
			// Vitest creates a middleware-only Vite server with no HTTP listener.
			if (!vite.httpServer) return;
			const runtime = await attachWebAgentRuntime(vite.httpServer, {
				argv: [],
				cwd: process.cwd()
			});
			vite.httpServer.once('close', () => void runtime.close());
		}
	};
}

export default defineConfig({
	server: {
		host: true,
		allowedHosts: true
	},
	plugins: [
		webAgentRuntime(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
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
