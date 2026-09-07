import type { Api, AuthEvent, AuthPrompt, AuthType, Model } from '@earendil-works/pi-ai';
import type { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { JsonObject } from '../lib/client/protocol.js';

export type AuthAvailability = 'ready' | 'unconfigured' | 'model_required';

export interface AuthRuntime {
	getProviders(): ReturnType<ModelRuntime['getProviders']>;
	checkAuth(providerId: string): ReturnType<ModelRuntime['checkAuth']>;
	listCredentials(): ReturnType<ModelRuntime['listCredentials']>;
	login(
		providerId: string,
		type: AuthType,
		interaction: Parameters<ModelRuntime['login']>[2]
	): ReturnType<ModelRuntime['login']>;
	logout(providerId: string): ReturnType<ModelRuntime['logout']>;
	getAvailable(providerId?: string): ReturnType<ModelRuntime['getAvailable']>;
}

export interface AuthSnapshot {
	providers: JsonObject[];
	enabled: boolean;
	disabledReason?: string;
}

export interface AuthUpdate {
	snapshot: AuthSnapshot;
	models: readonly Model<Api>[];
	availability: AuthAvailability;
}

export type AuthFlowEvent = JsonObject;
type FlowEmitter = (flowId: string, event: AuthFlowEvent) => void;
type UpdateListener = (update: AuthUpdate) => void;

interface PendingPrompt {
	id: string;
	secret: boolean;
	resolve(value: string): void;
	reject(error: Error): void;
	removeAbort?: () => void;
}

interface ActiveFlow {
	id: string;
	clientId: string;
	providerId: string;
	type: AuthType;
	abort: AbortController;
	emit: FlowEmitter;
	pending?: PendingPrompt;
	secrets: Set<string>;
}

function safeUrl(value: string): string | undefined {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

function sanitizedEvent(event: AuthEvent): JsonObject {
	if (event.type === 'auth_url') {
		const url = safeUrl(event.url);
		return url
			? {
					type: event.type,
					url,
					...(event.instructions ? { instructions: event.instructions } : {})
				}
			: { type: 'info', message: 'The provider returned an invalid authorization URL.' };
	}
	if (event.type === 'device_code') {
		const verificationUri = safeUrl(event.verificationUri);
		return verificationUri
			? {
					type: event.type,
					userCode: event.userCode,
					verificationUri,
					...(event.intervalSeconds === undefined
						? {}
						: { intervalSeconds: event.intervalSeconds }),
					...(event.expiresInSeconds === undefined
						? {}
						: { expiresInSeconds: event.expiresInSeconds })
				}
			: { type: 'info', message: 'The provider returned an invalid verification URL.' };
	}
	if (event.type === 'info') {
		const links = (event.links ?? [])
			.map((link) => {
				const url = safeUrl(link.url);
				return url ? { url, ...(link.label ? { label: link.label } : {}) } : undefined;
			})
			.filter((link): link is { url: string; label?: string } => link !== undefined);
		return { type: event.type, message: event.message, links } as JsonObject;
	}
	return { type: event.type, message: event.message };
}

function serializedPrompt(id: string, prompt: AuthPrompt): JsonObject {
	const base: JsonObject = {
		type: 'prompt',
		promptId: id,
		promptType: prompt.type,
		message: prompt.message
	};
	if ('placeholder' in prompt && prompt.placeholder) base.placeholder = prompt.placeholder;
	if (prompt.type === 'select') {
		base.options = prompt.options.map((option) => ({
			id: option.id,
			label: option.label,
			...(option.description ? { description: option.description } : {})
		}));
	}
	return base;
}

function redact(message: string, secrets: Set<string>): string {
	let result = message;
	for (const secret of secrets) {
		if (secret) result = result.split(secret).join('[redacted]');
	}
	return result;
}

/** Bridges Pi's provider-owned auth interactions to one originating browser tab. */
export class AuthController {
	private active: ActiveFlow | undefined;
	private readonly listeners = new Set<UpdateListener>();

	constructor(
		private readonly models: AuthRuntime,
		private readonly getSession: () => Pick<AgentSession, 'model'>,
		readonly enabled = true,
		readonly disabledReason = 'Browser authentication is disabled for this listener.'
	) {}

	subscribe(listener: UpdateListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async snapshot(): Promise<AuthSnapshot> {
		const stored = new Set((await this.models.listCredentials()).map((item) => item.providerId));
		const providers = await Promise.all(
			this.models.getProviders().map(async (provider) => {
				const status = await this.models.checkAuth(provider.id);
				const methods: JsonObject[] = [];
				if (provider.auth.oauth) {
					methods.push({
						type: 'oauth',
						name: provider.auth.oauth.name,
						label: provider.auth.oauth.loginLabel ?? 'Sign in with an account',
						interactive: true
					});
				}
				if (provider.auth.apiKey) {
					methods.push({
						type: 'api_key',
						name: provider.auth.apiKey.name,
						label: provider.auth.apiKey.login ? 'Add API key' : 'Configured outside Web Agent',
						interactive: provider.auth.apiKey.login !== undefined
					});
				}
				return {
					id: provider.id,
					name: provider.name,
					configured: status !== undefined,
					...(status?.source ? { source: status.source } : {}),
					...(status?.type ? { authType: status.type } : {}),
					stored: stored.has(provider.id),
					methods
				} satisfies JsonObject;
			})
		);
		return {
			providers: providers.sort((a, b) => String(a.name).localeCompare(String(b.name))),
			enabled: this.enabled,
			...(this.enabled ? {} : { disabledReason: this.disabledReason })
		};
	}

	async refresh(): Promise<AuthUpdate> {
		const [snapshot, models] = await Promise.all([this.snapshot(), this.models.getAvailable()]);
		const current = this.getSession().model;
		const availability: AuthAvailability =
			models.length === 0
				? 'unconfigured'
				: current &&
					  models.some((model) => model.provider === current.provider && model.id === current.id)
					? 'ready'
					: 'model_required';
		const update = { snapshot, models, availability };
		for (const listener of this.listeners) listener(update);
		return update;
	}

	start(clientId: string, providerId: string, type: AuthType, emit: FlowEmitter): string {
		if (!this.enabled) throw new Error(this.disabledReason);
		if (this.active) throw new Error('Another provider authentication change is in progress.');
		const provider = this.models.getProviders().find((item) => item.id === providerId);
		if (!provider) throw new Error(`Unknown provider: ${providerId}`);
		if (type === 'oauth' && !provider.auth.oauth)
			throw new Error(`${provider.name} does not support account sign-in.`);
		if (type === 'api_key' && !provider.auth.apiKey?.login)
			throw new Error(`${provider.name} must be configured outside Web Agent.`);

		const flow: ActiveFlow = {
			id: crypto.randomUUID(),
			clientId,
			providerId,
			type,
			abort: new AbortController(),
			emit,
			secrets: new Set()
		};
		this.active = flow;
		void this.run(flow, provider.name);
		return flow.id;
	}

	private async run(flow: ActiveFlow, providerName: string): Promise<void> {
		try {
			await this.models.login(flow.providerId, flow.type, {
				signal: flow.abort.signal,
				prompt: (prompt) => this.prompt(flow, prompt),
				notify: (event) => flow.emit(flow.id, sanitizedEvent(event))
			});
			await this.refresh();
			flow.emit(flow.id, {
				type: 'complete',
				message:
					flow.type === 'oauth'
						? `Signed in to ${providerName}.`
						: `Saved credentials for ${providerName}.`
			});
		} catch (error) {
			const cancelled = flow.abort.signal.aborted;
			const raw = error instanceof Error ? error.message : String(error);
			flow.emit(flow.id, {
				type: cancelled ? 'cancelled' : 'failed',
				message: cancelled ? 'Authentication cancelled.' : redact(raw, flow.secrets)
			});
		} finally {
			flow.pending?.removeAbort?.();
			if (this.active === flow) this.active = undefined;
		}
	}

	private prompt(flow: ActiveFlow, prompt: AuthPrompt): Promise<string> {
		if (flow.abort.signal.aborted || prompt.signal?.aborted)
			return Promise.reject(new Error('Authentication cancelled.'));
		if (flow.pending) return Promise.reject(new Error('Provider requested overlapping prompts.'));
		const promptId = crypto.randomUUID();
		return new Promise<string>((resolve, reject) => {
			const pending: PendingPrompt = {
				id: promptId,
				secret: prompt.type === 'secret',
				resolve,
				reject
			};
			if (prompt.signal) {
				const abort = () => {
					if (flow.pending === pending) flow.pending = undefined;
					reject(new Error('Authentication prompt cancelled.'));
				};
				prompt.signal.addEventListener('abort', abort, { once: true });
				pending.removeAbort = () => prompt.signal?.removeEventListener('abort', abort);
			}
			flow.pending = pending;
			flow.emit(flow.id, serializedPrompt(promptId, prompt));
		});
	}

	submit(clientId: string, flowId: string, promptId: string, value: string): void {
		const flow = this.ownedFlow(clientId, flowId);
		const pending = flow.pending;
		if (!pending || pending.id !== promptId)
			throw new Error('This authentication prompt is no longer active.');
		flow.pending = undefined;
		pending.removeAbort?.();
		if (pending.secret) flow.secrets.add(value);
		pending.resolve(value);
	}

	cancel(clientId: string, flowId: string): void {
		const flow = this.ownedFlow(clientId, flowId);
		flow.pending?.reject(new Error('Authentication cancelled.'));
		flow.pending = undefined;
		flow.abort.abort();
	}

	async logout(providerId: string): Promise<void> {
		if (!this.enabled) throw new Error(this.disabledReason);
		if (this.active) throw new Error('Another provider authentication change is in progress.');
		const stored = await this.models.listCredentials();
		if (!stored.some((item) => item.providerId === providerId))
			throw new Error('No stored credential exists for this provider.');
		await this.models.logout(providerId);
		await this.refresh();
	}

	disconnect(clientId: string): void {
		if (this.active?.clientId === clientId) this.cancel(clientId, this.active.id);
	}

	dispose(): void {
		if (this.active) {
			this.active.pending?.reject(new Error('Server shutting down.'));
			this.active.abort.abort();
			this.active = undefined;
		}
		this.listeners.clear();
	}

	private ownedFlow(clientId: string, flowId: string): ActiveFlow {
		if (!this.active || this.active.id !== flowId || this.active.clientId !== clientId)
			throw new Error('Authentication flow not found.');
		return this.active;
	}
}
