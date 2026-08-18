import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: fileURLToPath(new URL('./src', import.meta.url)),
	publicDir: fileURLToPath(new URL('./public', import.meta.url)),
	plugins: [tailwindcss(), svelte()],
	build: {
		outDir: fileURLToPath(new URL('./build/client', import.meta.url)),
		emptyOutDir: true
	},
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
