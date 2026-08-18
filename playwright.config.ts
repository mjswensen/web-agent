import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'bun run build && bun run start --port 4173 --no-session --pi ./scripts/fake-pi.ts',
		port: 4173
	},
	testMatch: '**/src/e2e/*.e2e.{ts,js}'
});
