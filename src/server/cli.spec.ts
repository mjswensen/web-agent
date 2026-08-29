import { describe, expect, it } from 'vitest';
import { DEFAULT_HOST, DEFAULT_PORT, parseCliArgs } from './cli.js';

describe('Web Agent CLI parsing', () => {
	it('uses loopback and embedded-runtime defaults', () => {
		expect(parseCliArgs([], {})).toEqual({
			port: DEFAULT_PORT,
			host: DEFAULT_HOST,
			open: false,
			sdk: { continueSession: false, noSession: false }
		});
	});

	it('uses PI_WEB_PORT unless the CLI overrides it', () => {
		expect(parseCliArgs([], { PI_WEB_PORT: '4321' }).port).toBe(4321);
		expect(parseCliArgs(['--port', '9876'], { PI_WEB_PORT: '4321' }).port).toBe(9876);
	});

	it('parses typed SDK startup options', () => {
		const options = parseCliArgs([
			'--open',
			'-c',
			'--session-dir=history',
			'--provider',
			'anthropic',
			'--model',
			'sonnet',
			'--thinking',
			'high',
			'--api-key',
			'test-key'
		]);
		expect(options.open).toBe(true);
		expect(options.sdk).toEqual({
			continueSession: true,
			noSession: false,
			sessionDir: 'history',
			provider: 'anthropic',
			model: 'sonnet',
			thinking: 'high',
			apiKey: 'test-key'
		});
	});

	it('rejects removed subprocess flags and conflicting session targets', () => {
		expect(() => parseCliArgs(['--pi', '/opt/pi'])).toThrow('removed');
		expect(() => parseCliArgs(['--resume'])).toThrow('removed');
		expect(() => parseCliArgs(['--continue', '--no-session'])).toThrow('mutually exclusive');
	});

	it('rejects malformed ports and unrecognized flags', () => {
		expect(() => parseCliArgs(['--port', 'wat'])).toThrow('Invalid port');
		expect(() => parseCliArgs(['--port', '65536'])).toThrow('Invalid port');
		expect(() => parseCliArgs(['--unknown'])).toThrow('Unknown option');
	});
});
