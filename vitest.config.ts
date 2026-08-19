import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			$lib: '/src/lib'
		}
	},
	test: {
		expect: { requireAssertions: true },
		reporters: ['default', './scripts/bun-exit-reporter.ts'],
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
