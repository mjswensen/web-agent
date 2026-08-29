import { describe, expect, it } from 'vitest';
import { parseClientFrame } from '../lib/client/protocol.js';
import { mapCommandToAgent, RpcBroker } from './rpc-broker.js';
import type { AgentTransport } from './agent-transport.js';

class FakePi implements AgentTransport {
	readonly writes: unknown[] = [];
	private recordListener: ((record: unknown) => void) | undefined;
	private errorListener: ((error: Error) => void) | undefined;

	async send(command: unknown): Promise<void> {
		this.writes.push(command);
	}

	onRecord(listener: (record: unknown) => void): () => void {
		this.recordListener = listener;
		return () => undefined;
	}

	onError(listener: (error: Error) => void): () => void {
		this.errorListener = listener;
		return () => undefined;
	}

	emitRecord(record: unknown): void {
		this.recordListener?.(record);
	}
}

function command(
	id: string,
	name:
		| 'prompt'
		| 'get_state'
		| 'get_session_list'
		| 'get_git_status'
		| 'get_git_diff'
		| 'set_session_name'
) {
	const frame = parseClientFrame({
		kind: 'command',
		id,
		command: name,
		params:
			name === 'prompt'
				? { message: 'Hello' }
				: name === 'set_session_name'
					? { name: 'Renamed session' }
					: name === 'get_git_diff'
						? { token: 'opaque-token' }
						: {}
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
		expect(() => mapCommandToAgent(command('a', 'prompt'), 'pi-a')).not.toThrow();
		expect(() =>
			mapCommandToAgent(
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

	it('maps session rename and refreshes the shared session list only after success', async () => {
		const pi = new FakePi();
		let listCalls = 0;
		const broker = new RpcBroker(pi, {
			sessionList: {
				list: async () => {
					listCalls += 1;
					return { sessions: [{ name: 'Renamed session' }] };
				}
			}
		});
		const frames: unknown[] = [];
		broker.addClient({ id: 'client', send: (frame) => frames.push(frame) });
		await broker.handleClientFrame('client', command('rename', 'set_session_name'));
		const request = pi.writes[0] as { id: string };
		expect(request).toMatchObject({ type: 'set_session_name', name: 'Renamed session' });
		pi.emitRecord({ type: 'response', id: request.id, success: true });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(listCalls).toBeGreaterThan(0);
		expect(frames).toContainEqual({
			kind: 'response',
			id: 'rename',
			command: 'set_session_name',
			success: true
		});
	});

	it('serves session lists internally without forwarding them to Pi', async () => {
		const pi = new FakePi();
		const broker = new RpcBroker(pi, {
			sessionList: {
				list: async () => ({ sessions: [{ id: 'one', path: '/sessions/one.jsonl' }] })
			}
		});
		const frames: unknown[] = [];
		broker.addClient({ id: 'client', send: (frame) => frames.push(frame) });
		await broker.handleClientFrame('client', command('session-list', 'get_session_list'));

		expect(pi.writes).toEqual([]);
		expect(frames).toContainEqual({
			kind: 'snapshot',
			snapshotType: 'session_list',
			data: { sessions: [{ id: 'one', path: '/sessions/one.jsonl' }] }
		});
		expect(frames).toContainEqual({
			kind: 'response',
			id: 'session-list',
			command: 'get_session_list',
			success: true,
			data: { sessions: [{ id: 'one', path: '/sessions/one.jsonl' }] }
		});
	});

	it('serves Git status internally, broadcasts its snapshot, and responds only to the requester', async () => {
		const pi = new FakePi();
		const snapshot = {
			state: 'ready' as const,
			repositoryRoot: '/workspaces/demo-project',
			branch: { name: 'main', detached: false },
			refreshedAt: '2026-01-01T00:00:00.000Z',
			files: []
		};
		const broker = new RpcBroker(pi, { gitStatus: { getStatus: async () => snapshot } });
		const first: unknown[] = [];
		const second: unknown[] = [];
		broker.addClient({ id: 'first', send: (frame) => first.push(frame) });
		broker.addClient({ id: 'second', send: (frame) => second.push(frame) });

		await broker.handleClientFrame('first', command('changes', 'get_git_status'));

		expect(pi.writes).toEqual([]);
		expect(first).toContainEqual({ kind: 'snapshot', snapshotType: 'git_status', data: snapshot });
		expect(second).toContainEqual({ kind: 'snapshot', snapshotType: 'git_status', data: snapshot });
		expect(first).toContainEqual({
			kind: 'response',
			id: 'changes',
			command: 'get_git_status',
			success: true,
			data: snapshot
		});
		expect(second).not.toContainEqual(expect.objectContaining({ kind: 'response' }));
	});

	it('streams a full Git diff only to the requesting client using an opaque token', async () => {
		const pi = new FakePi();
		const broker = new RpcBroker(pi, {
			gitStatus: {
				getStatus: async () => ({ state: 'not_repository' as const, refreshedAt: 'now' }),
				hasDiff: (token) => token === 'opaque-token',
				streamDiff: async (_token, onChunk) => {
					onChunk('first chunk\\n');
					onChunk('second chunk\\n');
				}
			}
		});
		const first: unknown[] = [];
		const second: unknown[] = [];
		broker.addClient({ id: 'first', send: (frame) => first.push(frame) });
		broker.addClient({ id: 'second', send: (frame) => second.push(frame) });

		await broker.handleClientFrame('first', command('full-diff', 'get_git_diff'));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(pi.writes).toEqual([]);
		expect(first).toContainEqual({
			kind: 'response',
			id: 'full-diff',
			command: 'get_git_diff',
			success: true
		});
		expect(first).toContainEqual({
			kind: 'git_diff_chunk',
			token: 'opaque-token',
			chunk: 'first chunk\\n'
		});
		expect(first).toContainEqual({ kind: 'git_diff_chunk', token: 'opaque-token', done: true });
		expect(second).toEqual([]);
	});

	it('includes the launch directory in state snapshots', async () => {
		const pi = new FakePi();
		const broker = new RpcBroker(pi, { cwd: '/workspaces/demo-project' });
		const frames: unknown[] = [];
		broker.addClient({ id: 'client', send: (frame) => frames.push(frame) });

		expect(frames).toContainEqual({
			kind: 'snapshot',
			snapshotType: 'state',
			data: { cwd: '/workspaces/demo-project', projectName: 'demo-project' }
		});

		await broker.handleClientFrame('client', command('state-request', 'get_state'));
		const piRequest = pi.writes[0] as { id: string };
		pi.emitRecord({
			id: piRequest.id,
			type: 'response',
			command: 'get_state',
			success: true,
			data: { isStreaming: false }
		});

		expect(frames).toContainEqual({
			kind: 'snapshot',
			snapshotType: 'state',
			data: {
				isStreaming: false,
				cwd: '/workspaces/demo-project',
				projectName: 'demo-project'
			}
		});
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
