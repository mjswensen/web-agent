import type { Reporter, TestRunEndReason } from 'vitest/reporters';

/** Work around Playwright's lingering handle when Vitest's browser project runs under Bun. */
export default class BunExitReporter implements Reporter {
	onTestRunEnd(
		_testModules: Parameters<NonNullable<Reporter['onTestRunEnd']>>[0],
		_unhandledErrors: Parameters<NonNullable<Reporter['onTestRunEnd']>>[1],
		reason: TestRunEndReason
	): void {
		if (!process.argv.includes('--run')) return;
		setTimeout(() => process.exit(reason === 'passed' ? 0 : 1), 50);
	}
}
