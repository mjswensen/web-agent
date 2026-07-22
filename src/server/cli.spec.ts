import { describe, expect, it } from 'vitest';
import {
	buildPiArguments,
	CliError,
	DEFAULT_HOST,
	DEFAULT_PORT,
	isLoopbackHost,
	parseCliArgs
} from './cli.js';

describe('Web Agent CLI parsing', () => {
	it('uses local, safe defaults', () => {
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

	it('accepts only loopback hosts', () => {
		expect(isLoopbackHost('localhost')).toBe(true);
		expect(isLoopbackHost('127.100.2.3')).toBe(true);
		expect(isLoopbackHost('::1')).toBe(true);
		expect(isLoopbackHost('0.0.0.0')).toBe(false);
		expect(() => parseCliArgs(['--bind', '192.168.1.10'])).toThrow(CliError);
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
