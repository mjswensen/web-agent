import { describe, expect, it, vi } from 'vitest';
import type { AuthInteraction, Credential, Provider } from '@earendil-works/pi-ai';
import { AuthController, type AuthRuntime } from './auth-controller.js';

function provider(): Provider {
	return {
		id: 'test',
		name: 'Test Provider',
		auth: {
			apiKey: {
				name: 'Test API key',
				login: async (interaction) => ({
					type: 'api_key',
					key: await interaction.prompt({ type: 'secret', message: 'Enter key' })
				}),
				resolve: async () => undefined
			},
			oauth: {
				name: 'Test account',
				login: async () => ({ type: 'oauth', access: '', refresh: '', expires: 0 }),
				refresh: async (credential) => credential,
				toAuth: async () => ({})
			}
		},
		getModels: () => [],
		stream: (() => undefined) as never,
		streamSimple: (() => undefined) as never
	};
}

function fakeRuntime(login: (interaction: AuthInteraction) => Promise<Credential>) {
	const stored: string[] = [];
	return {
		getProviders: () => [provider()],
		checkAuth: async () =>
			stored.length ? { type: 'api_key' as const, source: 'Stored key' } : undefined,
		listCredentials: async () =>
			stored.map((providerId) => ({ providerId, type: 'api_key' as const })),
		login: async (_providerId, _type, interaction) => {
			const credential = await login(interaction);
			stored.push('test');
			return credential;
		},
		logout: async () => {
			stored.length = 0;
		},
		getAvailable: async () => []
	} satisfies AuthRuntime;
}

async function tick() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AuthController', () => {
	it('bridges provider prompts and events without returning a submitted secret', async () => {
		const runtime = fakeRuntime(async (interaction) => {
			interaction.notify({ type: 'auth_url', url: 'https://provider.example/login' });
			const key = await interaction.prompt({ type: 'secret', message: 'Enter key' });
			return { type: 'api_key', key };
		});
		const events: Array<{ flowId: string; event: Record<string, unknown> }> = [];
		const controller = new AuthController(runtime, () => ({ model: undefined }));
		const flowId = controller.start('first', 'test', 'api_key', (id, event) =>
			events.push({ flowId: id, event })
		);
		await tick();

		expect(events).toContainEqual({
			flowId,
			event: { type: 'auth_url', url: 'https://provider.example/login' }
		});
		const prompt = events.find((item) => item.event.type === 'prompt')?.event;
		expect(prompt).toMatchObject({ promptType: 'secret', message: 'Enter key' });
		controller.submit('first', flowId, String(prompt?.promptId), 'super-secret');
		await vi.waitFor(() =>
			expect(events.some((item) => item.event.type === 'complete')).toBe(true)
		);
		expect(JSON.stringify(events)).not.toContain('super-secret');
	});

	it('serializes device, information, select, and manual-code interaction shapes safely', async () => {
		const runtime = fakeRuntime(async (interaction) => {
			interaction.notify({
				type: 'info',
				message: 'Read the provider guide.',
				links: [
					{ url: 'https://provider.example/guide', label: 'Guide' },
					{ url: 'javascript:alert(1)', label: 'Unsafe' }
				]
			});
			interaction.notify({
				type: 'device_code',
				userCode: 'ABCD-1234',
				verificationUri: 'https://provider.example/device',
				expiresInSeconds: 300
			});
			interaction.notify({ type: 'progress', message: 'Waiting for provider…' });
			await interaction.prompt({
				type: 'select',
				message: 'Choose account',
				options: [{ id: 'work', label: 'Work', description: 'Company account' }]
			});
			const code = await interaction.prompt({
				type: 'manual_code',
				message: 'Paste authorization code',
				placeholder: 'code'
			});
			return { type: 'api_key', key: code };
		});
		const events: Record<string, unknown>[] = [];
		const controller = new AuthController(runtime, () => ({ model: undefined }));
		const flowId = controller.start('first', 'test', 'api_key', (_id, event) => events.push(event));
		await tick();
		expect(events[0]).toEqual({
			type: 'info',
			message: 'Read the provider guide.',
			links: [{ url: 'https://provider.example/guide', label: 'Guide' }]
		});
		expect(events).toContainEqual({
			type: 'device_code',
			userCode: 'ABCD-1234',
			verificationUri: 'https://provider.example/device',
			expiresInSeconds: 300
		});
		let prompt = events.find((event) => event.promptType === 'select');
		expect(prompt).toMatchObject({ options: [{ id: 'work', label: 'Work' }] });
		controller.submit('first', flowId, String(prompt?.promptId), 'work');
		await vi.waitFor(() =>
			expect(events.some((event) => event.promptType === 'manual_code')).toBe(true)
		);
		prompt = events.find((event) => event.promptType === 'manual_code');
		controller.submit('first', flowId, String(prompt?.promptId), 'authorization-code');
		await vi.waitFor(() => expect(events.at(-1)?.type).toBe('complete'));
	});

	it('redacts submitted secrets from provider errors', async () => {
		const runtime = fakeRuntime(async (interaction) => {
			const key = await interaction.prompt({ type: 'secret', message: 'Enter key' });
			throw new Error(`Provider rejected ${key}`);
		});
		const events: Record<string, unknown>[] = [];
		const controller = new AuthController(runtime, () => ({ model: undefined }));
		const flowId = controller.start('first', 'test', 'api_key', (_id, event) => events.push(event));
		await tick();
		const prompt = events.find((item) => item.type === 'prompt');
		controller.submit('first', flowId, String(prompt?.promptId), 'do-not-leak');
		await vi.waitFor(() => expect(events.some((item) => item.type === 'failed')).toBe(true));
		expect(events.at(-1)).toMatchObject({ message: 'Provider rejected [redacted]' });
	});

	it('rejects another tab and aborts the owning flow when it disconnects', async () => {
		let aborted = false;
		const runtime = fakeRuntime(
			(interaction) =>
				new Promise((_resolve, reject) => {
					interaction.signal?.addEventListener('abort', () => {
						aborted = true;
						reject(new Error('aborted'));
					});
				})
		);
		const events: Record<string, unknown>[] = [];
		const controller = new AuthController(runtime, () => ({ model: undefined }));
		const flowId = controller.start('owner', 'test', 'oauth', (_id, event) => events.push(event));
		expect(() => controller.cancel('other', flowId)).toThrow('not found');
		expect(() => controller.start('other', 'test', 'oauth', () => undefined)).toThrow(
			'Another provider authentication change'
		);
		controller.disconnect('owner');
		await vi.waitFor(() => expect(aborted).toBe(true));
		await vi.waitFor(() => expect(events.at(-1)?.type).toBe('cancelled'));
	});

	it('reports stored credentials without exposing credential values', async () => {
		const runtime = fakeRuntime(async () => ({ type: 'api_key', key: 'hidden' }));
		await runtime.login('test', 'api_key', {
			prompt: async () => '',
			notify: () => undefined
		});
		const controller = new AuthController(runtime, () => ({ model: undefined }));
		const snapshot = await controller.snapshot();
		expect(snapshot.providers[0]).toMatchObject({
			id: 'test',
			configured: true,
			stored: true,
			source: 'Stored key'
		});
		expect(JSON.stringify(snapshot)).not.toContain('hidden');
	});
});
