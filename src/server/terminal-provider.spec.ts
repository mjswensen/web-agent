import { describe, expect, it } from 'vitest';
import { BunTerminalProvider } from './terminal-provider.js';

function timeout(milliseconds: number): Promise<never> {
	return new Promise((_, reject) =>
		setTimeout(() => reject(new Error('Terminal test timed out.')), milliseconds)
	);
}

describe('BunTerminalProvider', () => {
	it('runs an interactive shell in the launch project and streams PTY output', async () => {
		const provider = new BunTerminalProvider(process.cwd());
		let output = '';
		let resolveExit: () => void = () => undefined;
		const exited = new Promise<void>((resolve) => {
			resolveExit = resolve;
		});
		try {
			provider.open('browser', {
				cols: 80,
				rows: 24,
				callbacks: {
					onData: (data) => {
						output += new TextDecoder().decode(data);
					},
					onExit: () => resolveExit()
				}
			});
			provider.write('browser', 'pwd; exit\n');
			await Promise.race([exited, timeout(3000)]);
			expect(output).toContain(process.cwd());
		} finally {
			provider.dispose();
		}
	});

	it('terminates a disconnected browser terminal after its grace period', async () => {
		const provider = new BunTerminalProvider(process.cwd(), 10);
		try {
			provider.open('browser', {
				cols: 80,
				rows: 24,
				callbacks: { onData: () => undefined, onExit: () => undefined }
			});
			provider.disconnect('browser');
			await Bun.sleep(30);
			expect(() => provider.write('browser', 'echo still-running\n')).toThrow(
				'No terminal is running'
			);
		} finally {
			provider.dispose();
		}
	});
});
