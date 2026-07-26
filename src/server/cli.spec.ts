import { describe, expect, it } from 'vitest';
import { buildPiArguments, DEFAULT_HOST, DEFAULT_PORT, parseCliArgs } from './cli.js';

describe('Web Agent CLI parsing', () => {
	it('uses loopback defaults', () => {
		const options = parseCliArgs([], {});
		expect(options).toEqual({
			port: DEFAULT_PORT,
			host: DEFAULT_HOST,
			open: false,
			piPath: undefined,
			piArgs: [],
			sessionDir: undefined
		});
	});

	it('uses PI_WEB_PORT unless the CLI overrides it', () => {
		expect(parseCliArgs([], { PI_WEB_PORT: '4321' }).port).toBe(4321);
		expect(parseCliArgs(['--port', '9876'], { PI_WEB_PORT: '4321' }).port).toBe(9876);
	});

	it('accepts any listen address', () => {
		expect(parseCliArgs(['--bind', '0.0.0.0']).host).toBe('0.0.0.0');
		expect(parseCliArgs(['--host', '192.168.1.10']).host).toBe('192.168.1.10');
		expect(parseCliArgs(['--host', '::']).host).toBe('::');
	});

	it('forwards only documented Pi startup flags and always adds RPC mode', () => {
		const options = parseCliArgs([
			'--open',
			'--pi=/opt/pi',
			'-c',
			'--session',
			'saved.jsonl',
			'--session-dir=history',
			'--model',
			'sonnet',
			'--thinking',
			'high'
		]);

		expect(options.open).toBe(true);
		expect(options.piPath).toBe('/opt/pi');
		expect(options.sessionDir).toBe('history');
		expect(buildPiArguments(options)).toEqual([
			'--mode',
			'rpc',
			'--continue',
			'--session',
			'saved.jsonl',
			'--session-dir',
			'history',
			'--model',
			'sonnet',
			'--thinking',
			'high'
		]);
	});

	it('rejects malformed ports and unrecognized flags before launching a child', () => {
		expect(() => parseCliArgs(['--port', 'wat'])).toThrow('Invalid port');
		expect(() => parseCliArgs(['--port', '65536'])).toThrow('Invalid port');
		expect(() => parseCliArgs(['--unknown'])).toThrow('Unknown option');
	});
});
