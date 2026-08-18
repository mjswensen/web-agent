import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'bun run build && bun run preview', port: 3000 },
	testMatch: '**/*.e2e.{ts,js}'
});
