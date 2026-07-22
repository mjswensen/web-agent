import { describe, expect, it } from 'vitest';
import { parseClientFrame } from '../lib/client/protocol.js';
import { mapCommandToPi, RpcBroker, type PiRpcTransport } from './rpc-broker.js';

class FakePi implements PiRpcTransport {
	readonly writes: unknown[] = [];
	private recordListener: ((record: unknown) => void) | undefined;
	private errorListener: ((error: Error) => void) | undefined;
	private exitListener:
		((exit: { code: number | null; signal: NodeJS.Signals | null }) => void) | undefined;

	async send(command: unknown): Promise<void> {
		this.writes.push(command);
	}

	onRecord(listener: (record: unknown) => void): () => void {
		this.recordListener = listener;
		return () => undefined;
	}

	onProtocolError(listener: (error: Error) => void): () => void {
		this.errorListener = listener;
		return () => undefined;
	}

	onExit(
		listener: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void
	): () => void {
		this.exitListener = listener;
		return () => undefined;
	}

	emitRecord(record: unknown): void {
		this.recordListener?.(record);
	}
}

function command(id: string, name: 'prompt' | 'get_state') {
	const frame = parseClientFrame({
		kind: 'command',
		id,
		command: name,
		params: name === 'prompt' ? { message: 'Hello' } : {}
	});
	if (!frame.ok || frame.frame.kind !== 'command') throw new Error('Invalid test frame.');
	return frame.frame;
}

describe('browser protocol validation and Pi RPC broker', () => {
	it('rejects malformed browser frames before they can reach Pi', () => {
		expect(
			parseClientFrame({ kind: 'command', id: 'a', command: 'bash', params: {} })
		).toMatchObject({
			ok: false,
			error: 'Unsupported command: bash'
		});
		expect(() => mapCommandToPi(command('a', 'prompt'), 'pi-a')).not.toThrow();
		expect(() =>
			mapCommandToPi(
				{ kind: 'command', id: 'a', command: 'set_model', params: { provider: 'x' } },
				'pi-a'
			)
		).toThrow('modelId must be a non-empty string');
	});

	it('correlates a Pi response only to its originating browser client', async () => {
		const pi = new FakePi();
		const broker = new RpcBroker(pi);
		const first: unknown[] = [];
		const second: unknown[] = [];
		broker.addClient({ id: 'first', send: (frame) => first.push(frame) });
		broker.addClient({ id: 'second', send: (frame) => second.push(frame) });

		await broker.handleClientFrame('first', command('browser-request', 'prompt'));
		const piRequest = pi.writes[0] as { id: string; type: string; message: string };
		expect(piRequest).toMatchObject({ type: 'prompt', message: 'Hello' });
		expect(piRequest.id).toMatch(/^web-agent-1-/);

		pi.emitRecord({ id: piRequest.id, type: 'response', command: 'prompt', success: true });

		expect(first).toEqual([
			{ kind: 'response', id: 'browser-request', command: 'prompt', success: true }
		]);
		expect(second).toEqual([]);
	});

	it('broadcasts events and retains successful state snapshots for reconnecting clients', async () => {
		const pi = new FakePi();
		const broker = new RpcBroker(pi);
		const initial: unknown[] = [];
		broker.addClient({ id: 'initial', send: (frame) => initial.push(frame) });

		await broker.handleClientFrame('initial', command('state-request', 'get_state'));
		const piRequest = pi.writes[0] as { id: string };
		pi.emitRecord({
			id: piRequest.id,
			type: 'response',
			command: 'get_state',
			success: true,
			data: { isStreaming: false }
		});
		pi.emitRecord({ type: 'agent_start' });

		const reconnecting: unknown[] = [];
		broker.addClient({ id: 'reconnecting', send: (frame) => reconnecting.push(frame) });

		expect(initial).toContainEqual({
			kind: 'snapshot',
			snapshotType: 'state',
			data: { isStreaming: false }
		});
		expect(initial).toContainEqual({ kind: 'event', event: { type: 'agent_start' } });
		expect(reconnecting).toEqual([
			{ kind: 'snapshot', snapshotType: 'state', data: { isStreaming: false } }
		]);
	});
});
