import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	getAgentDir,
	hasTrustRequiringProjectResources,
	ModelRuntime,
	ProjectTrustStore,
	resolveCliModel,
	SessionManager,
	SettingsManager,
	type AgentSessionRuntime,
	type AgentSessionRuntimeDiagnostic,
	type CreateAgentSessionRuntimeFactory
} from '@earendil-works/pi-coding-agent';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { registerBunOAuthFlows } from '@earendil-works/pi-ai/bun-oauth';
import type { SdkStartupOptions } from './cli.js';
import { createSessionListProvider, type SessionListProvider } from './session-list.js';

// The SDK's OAuth loaders use bundler-opaque dynamic imports in normal installations. Register
// static loaders so Bun embeds the implementations in the standalone executable.
registerBunOAuthFlows();

export type AgentAvailability = 'ready' | 'unconfigured' | 'unavailable';

export interface SdkRuntimeOwner {
	runtime: AgentSessionRuntime;
	launchCwd: string;
	availability: AgentAvailability;
	diagnostics: readonly AgentSessionRuntimeDiagnostic[];
	sessionList: SessionListProvider;
	close(timeoutMs?: number): Promise<void>;
}

const thinkingLevels = new Set<ThinkingLevel>([
	'off',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
	'max'
]);

function thinkingLevel(value: string | undefined): ThinkingLevel | undefined {
	if (value === undefined) return undefined;
	if (!thinkingLevels.has(value as ThinkingLevel))
		throw new Error(`Invalid thinking level: ${value}`);
	return value as ThinkingLevel;
}

async function projectTrusted(
	cwd: string,
	agentDir: string
): Promise<{ trusted: boolean; diagnostic?: AgentSessionRuntimeDiagnostic }> {
	if (!hasTrustRequiringProjectResources(cwd)) return { trusted: true };
	const store = new ProjectTrustStore(agentDir);
	const saved = store.get(cwd);
	if (saved !== null) return { trusted: saved };
	const globalSettings = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
	const policy = globalSettings.getDefaultProjectTrust();
	if (policy === 'always') return { trusted: true };
	return {
		trusted: false,
		diagnostic: {
			type: 'warning',
			message:
				policy === 'never'
					? `Ignored untrusted project resources in ${cwd} (defaultProjectTrust is never).`
					: `Ignored untrusted project resources in ${cwd}; use Pi once to save a trust decision.`
		}
	};
}

async function resolveSessionManager(
	cwd: string,
	startup: SdkStartupOptions
): Promise<SessionManager> {
	const sessionDir = startup.sessionDir ? resolve(cwd, startup.sessionDir) : undefined;
	if (startup.noSession) return SessionManager.inMemory(cwd);
	if (startup.continueSession) return SessionManager.continueRecent(cwd, sessionDir);
	if (!startup.session) return SessionManager.create(cwd, sessionDir);

	const requested = startup.session;
	const listed = await SessionManager.list(cwd, sessionDir);
	let path: string | undefined;
	if (isAbsolute(requested) || requested.includes('/') || requested.includes('\\')) {
		path = resolve(cwd, requested);
	} else {
		const matches = listed.filter(
			(session) =>
				session.id === requested || session.id.startsWith(requested) || session.path === requested
		);
		if (matches.length > 1) throw new Error(`Session id "${requested}" is ambiguous.`);
		path = matches[0]?.path;
	}
	if (!path) throw new Error(`Session not found in the launch project: ${requested}`);
	const opened = SessionManager.open(path, sessionDir);
	const recordedCwd = opened.getCwd();
	if (recordedCwd && resolve(recordedCwd) !== cwd)
		throw new Error(`Cannot open a session from another project: ${recordedCwd}`);
	if (!recordedCwd && !listed.some((session) => resolve(session.path) === resolve(path)))
		throw new Error(
			'A legacy session without cwd must be in the launch project session directory.'
		);
	return SessionManager.open(path, sessionDir, recordedCwd ? undefined : cwd);
}

function apiKeyProvider(
	startup: SdkStartupOptions,
	modelRuntime: ModelRuntime
): string | undefined {
	if (!startup.apiKey) return undefined;
	if (startup.provider) return startup.provider;
	if (startup.model?.includes('/')) {
		const provider = startup.model.slice(0, startup.model.indexOf('/'));
		if (modelRuntime.getProvider(provider)) return provider;
	}
	throw new Error('--api-key requires --provider or a provider-qualified --model.');
}

/** Creates and owns the only in-process AgentSessionRuntime. */
export async function createSdkRuntime(
	startup: SdkStartupOptions,
	cwdInput = process.cwd()
): Promise<SdkRuntimeOwner> {
	const launchCwd = resolve(cwdInput);
	const agentDir = getAgentDir();
	// Force telemetry and provider-attribution headers off for this host without persisting a setting.
	process.env.PI_TELEMETRY = '0';
	const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false });
	const keyProvider = apiKeyProvider(startup, modelRuntime);
	if (keyProvider && startup.apiKey)
		await modelRuntime.setRuntimeApiKey(keyProvider, startup.apiKey);
	const cliModel = resolveCliModel({
		cliProvider: startup.provider,
		cliModel: startup.model,
		cliThinking: thinkingLevel(startup.thinking),
		modelRuntime
	});
	if (cliModel.error) throw new Error(cliModel.error);
	const trust = await projectTrusted(launchCwd, agentDir);
	const hostDiagnostics: AgentSessionRuntimeDiagnostic[] = trust.diagnostic
		? [trust.diagnostic]
		: [];
	const settingsManagers = new Set<SettingsManager>();

	const createRuntime: CreateAgentSessionRuntimeFactory = async ({
		cwd,
		sessionManager,
		sessionStartEvent
	}) => {
		if (resolve(cwd) !== launchCwd)
			throw new Error(`Cross-project sessions are not allowed: ${cwd}`);
		const settingsManager = SettingsManager.create(launchCwd, agentDir, {
			projectTrusted: trust.trusted
		});
		settingsManagers.add(settingsManager);
		// Runtime-only restrictions: preserve the file while disabling package/extension/theme/image behavior.
		settingsManager.applyOverrides({
			packages: [],
			extensions: [],
			themes: [],
			enableInstallTelemetry: false,
			images: { blockImages: true }
		});
		const services = await createAgentSessionServices({
			cwd: launchCwd,
			agentDir,
			settingsManager,
			modelRuntime,
			resourceLoaderOptions: {
				noExtensions: true,
				noThemes: true,
				...(trust.trusted
					? {}
					: {
							agentsFilesOverride: (base) => ({
								agentsFiles: base.agentsFiles.filter((file) => {
									const path = relative(agentDir, file.path);
									return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
								})
							})
						})
			}
		});
		const result = await createAgentSessionFromServices({
			services,
			sessionManager,
			sessionStartEvent,
			...(cliModel.model ? { model: cliModel.model } : {}),
			...((thinkingLevel(startup.thinking) ?? cliModel.thinkingLevel)
				? { thinkingLevel: thinkingLevel(startup.thinking) ?? cliModel.thinkingLevel }
				: {})
		});
		return { ...result, services, diagnostics: [...hostDiagnostics, ...services.diagnostics] };
	};

	const configuredSessionDir = SettingsManager.create(launchCwd, agentDir, {
		projectTrusted: trust.trusted
	}).getSessionDir();
	const effectiveStartup = {
		...startup,
		sessionDir: startup.sessionDir ?? configuredSessionDir
	};
	const sessionManager = await resolveSessionManager(launchCwd, effectiveStartup);
	const runtime = await createAgentSessionRuntime(createRuntime, {
		cwd: launchCwd,
		agentDir,
		sessionManager
	});
	if (startup.name) runtime.session.setSessionName(startup.name);
	const available = await modelRuntime.getAvailable();
	let closed = false;
	return {
		runtime,
		launchCwd,
		availability: available.length > 0 ? 'ready' : 'unconfigured',
		diagnostics: runtime.diagnostics,
		sessionList: createSessionListProvider({
			cwd: launchCwd,
			sessionDir: effectiveStartup.sessionDir
				? resolve(launchCwd, effectiveStartup.sessionDir)
				: undefined
		}),
		async close(timeoutMs = 500) {
			if (closed) return;
			closed = true;
			const session = runtime.session;
			if (!session.isIdle) {
				void session.abort();
				await Promise.race([
					session.waitForIdle(),
					new Promise((done) => setTimeout(done, timeoutMs))
				]);
			}
			await Promise.all([...settingsManagers].map((settings) => settings.flush()));
			await runtime.dispose();
		}
	};
}
