import { describe, expect, it, vi } from 'vitest';
import type { McpConfigController } from './mcp-config.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	SessionManager,
	type AgentSession,
	type AgentSessionRuntime
} from '@earendil-works/pi-coding-agent';
import { SdkTransport } from './sdk-transport.js';

function fakeRuntime() {
	let promptDone!: () => void;
	const promptCompletion = new Promise<void>((resolve) => (promptDone = resolve));
	let newDone!: () => void;
	const newCompletion = new Promise<{ cancelled: boolean }>(
		(resolve) => (newDone = () => resolve({ cancelled: false }))
	);
	const session = {
		prompt: async (
			_message: string,
			options: { preflightResult?: (accepted: boolean) => void }
		) => {
			options.preflightResult?.(true);
			await promptCompletion;
		},
		subscribe: () => () => undefined,
		sessionManager: { getLeafId: () => null },
		resourceLoader: { getSkills: () => ({ skills: [] }) },
		promptTemplates: []
	} as unknown as AgentSession;
	const runtime = {
		session,
		setRebindSession: () => undefined,
		newSession: () => newCompletion
	} as unknown as AgentSessionRuntime;
	return { runtime, promptDone, newDone };
}

describe('SdkTransport', () => {
	it('preserves IDs and acknowledges a prompt at preflight, before completion', async () => {
		const fake = fakeRuntime();
		const transport = new SdkTransport(fake.runtime);
		const records: unknown[] = [];
		transport.onRecord((record) => records.push(record));
		await transport.send({ type: 'prompt', id: 'browser-1', message: 'Hello' });
		expect(records).toContainEqual({
			type: 'response',
			id: 'browser-1',
			command: 'prompt',
			success: true
		});
		fake.promptDone();
	});

	it('rejects cross-project sessions before runtime replacement', async () => {
		const root = mkdtempSync(join(tmpdir(), 'web-agent-sdk-'));
		try {
			const launchManager = SessionManager.create(
				join(root, 'launch'),
				join(root, 'launch-sessions')
			);
			const otherManager = SessionManager.create(join(root, 'other'), join(root, 'other-sessions'));
			const session = {
				subscribe: () => () => undefined,
				sessionManager: launchManager
			} as unknown as AgentSession;
			let switches = 0;
			const runtime = {
				cwd: join(root, 'launch'),
				session,
				setRebindSession: () => undefined,
				switchSession: async () => {
					switches += 1;
					return { cancelled: false };
				}
			} as unknown as AgentSessionRuntime;
			const records: unknown[] = [];
			const transport = new SdkTransport(runtime);
			transport.onRecord((record) => records.push(record));
			await transport.send({
				type: 'switch_session',
				id: 'switch',
				sessionPath: otherManager.getSessionFile()!
			});
			expect(switches).toBe(0);
			expect(records).toContainEqual(expect.objectContaining({ id: 'switch', success: false }));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('requires idle MCP writes and locks reloads against transitions and prompts', async () => {
		const fake = fakeRuntime();
		const session = fake.runtime.session;
		let idle = false;
		Object.defineProperty(session, 'isIdle', { get: () => idle });
		let finishReload!: () => void;
		const reload = new Promise<void>((resolve) => {
			finishReload = resolve;
		});
		session.reload = vi.fn(() => reload);
		const save = vi.fn(async () => undefined);
		const controller = { save } as unknown as McpConfigController;
		const transport = new SdkTransport(fake.runtime, controller);
		const records: unknown[] = [];
		transport.onRecord((record) => records.push(record));
		const command = { id: 'mcp', type: 'set_mcp_config', text: '{"mcpServers":{}}', revision: 'r' };
		await transport.send(command);
		expect(save).not.toHaveBeenCalled();
		expect(records).toContainEqual(expect.objectContaining({ id: 'mcp', success: false }));
		idle = true;
		const changing = transport.send(command);
		await transport.send({ id: 'new', type: 'new_session' });
		await transport.send({ id: 'prompt', type: 'prompt', message: 'Hello' });
		expect(records).toContainEqual(expect.objectContaining({ id: 'new', success: false }));
		expect(records).toContainEqual(expect.objectContaining({ id: 'prompt', success: false }));
		finishReload();
		await changing;
		expect(save).toHaveBeenCalledExactlyOnceWith(command.text, command.revision);
		expect(session.reload).toHaveBeenCalledOnce();
		expect(records).toContainEqual(expect.objectContaining({ id: 'mcp', success: true }));
	});

	it('rejects a competing session transition', async () => {
		const fake = fakeRuntime();
		const transport = new SdkTransport(fake.runtime);
		const records: unknown[] = [];
		transport.onRecord((record) => records.push(record));
		const first = transport.send({ type: 'new_session', id: 'first' });
		await transport.send({ type: 'new_session', id: 'second' });
		expect(records).toContainEqual(
			expect.objectContaining({
				type: 'response',
				id: 'second',
				success: false,
				error: 'Another session transition is already in progress.'
			})
		);
		fake.newDone();
		await first;
	});
});
