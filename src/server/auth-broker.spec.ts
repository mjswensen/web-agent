import { describe, expect, it, vi } from 'vitest';
import type { Provider } from '@earendil-works/pi-ai';
import type { CommandFrame } from '../lib/client/protocol.js';
import type { AgentTransport } from './agent-transport.js';
import { AuthController, type AuthRuntime } from './auth-controller.js';
import { RpcBroker } from './rpc-broker.js';

const provider = {
	id: 'test',
	name: 'Test Provider',
	auth: {
		apiKey: {
			name: 'Test API key',
			login: async () => ({ type: 'api_key' as const, key: '' }),
			resolve: async () => undefined
		}
	},
	getModels: () => [],
	stream: (() => undefined) as never,
	streamSimple: (() => undefined) as never
} satisfies Provider;

class NoopTransport implements AgentTransport {
	async send(): Promise<void> {}
	onRecord(): () => void {
		return () => undefined;
	}
	onError(): () => void {
		return () => undefined;
	}
}

function command(id: string, name: CommandFrame['command'], params = {}): CommandFrame {
	return { kind: 'command', id, command: name, params };
}

describe('auth broker routing', () => {
	it('sends provider interaction frames only to the tab that started the flow', async () => {
		const runtime = {
			getProviders: () => [provider],
			checkAuth: async () => undefined,
			listCredentials: async () => [],
			login: async (_providerId, _type, interaction) => {
				interaction.notify({ type: 'progress', message: 'Private progress' });
				const key = await interaction.prompt({ type: 'secret', message: 'Private prompt' });
				return { type: 'api_key' as const, key };
			},
			logout: async () => undefined,
			getAvailable: async () => []
		} satisfies AuthRuntime;
		const auth = new AuthController(runtime, () => ({ model: undefined }));
		const broker = new RpcBroker(new NoopTransport(), { auth });
		const first: unknown[] = [];
		const second: unknown[] = [];
		broker.addClient({ id: 'first', send: (frame) => first.push(frame) });
		broker.addClient({ id: 'second', send: (frame) => second.push(frame) });

		await broker.handleClientFrame(
			'first',
			command('start', 'start_auth', { providerId: 'test', authType: 'api_key' })
		);
		await vi.waitFor(() =>
			expect(first.some((frame) => (frame as { kind?: string }).kind === 'auth')).toBe(true)
		);
		expect(second).toEqual([]);
		broker.dispose();
	});
});
