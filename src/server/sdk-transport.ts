import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { resolve } from 'node:path';
import {
	SessionManager,
	type AgentSession,
	type AgentSessionRuntime
} from '@earendil-works/pi-coding-agent';
import type { AgentTransport } from './agent-transport.js';

interface Command {
	id?: string;
	type: string;
	[key: string]: unknown;
}
interface Response {
	type: 'response';
	id?: string;
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

type Listener<T> = (value: T) => void;

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Public-SDK command adapter retaining the browser-facing RPC response/event shapes. */
export class SdkTransport implements AgentTransport {
	private readonly records = new Set<Listener<unknown>>();
	private readonly errors = new Set<Listener<Error>>();
	private unsubscribeSession: (() => void) | undefined;
	private transitionActive = false;

	constructor(private readonly runtime: AgentSessionRuntime) {
		this.bindSession();
		runtime.setRebindSession(async () => this.bindSession());
	}

	onRecord(listener: Listener<unknown>): () => void {
		this.records.add(listener);
		return () => this.records.delete(listener);
	}

	onError(listener: Listener<Error>): () => void {
		this.errors.add(listener);
		return () => this.errors.delete(listener);
	}

	dispose(): void {
		this.unsubscribeSession?.();
		this.records.clear();
		this.errors.clear();
	}

	private bindSession(): void {
		this.unsubscribeSession?.();
		this.unsubscribeSession = this.runtime.session.subscribe((event) => this.emit(event));
	}

	private emit(record: unknown): void {
		for (const listener of this.records) listener(record);
	}

	private response(response: Response): void {
		this.emit(response);
	}
	private success(command: Command, data?: unknown): void {
		this.response({
			type: 'response',
			id: command.id,
			command: command.type,
			success: true,
			...(data === undefined ? {} : { data })
		});
	}
	private failure(command: Command, error: unknown): void {
		this.response({
			type: 'response',
			id: command.id,
			command: command.type,
			success: false,
			error: message(error)
		});
	}

	async send(value: unknown): Promise<void> {
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new Error('Agent command must be an object.');
		const command = value as Command;
		if (typeof command.type !== 'string') throw new Error('Agent command requires a type.');
		if (['new_session', 'switch_session', 'fork', 'clone'].includes(command.type)) {
			if (this.transitionActive) {
				this.failure(command, new Error('Another session transition is already in progress.'));
				return;
			}
			this.transitionActive = true;
			try {
				await this.dispatch(command);
			} catch (error) {
				this.failure(command, error);
			} finally {
				this.transitionActive = false;
			}
			return;
		}
		try {
			await this.dispatch(command);
		} catch (error) {
			this.failure(command, error);
		}
	}

	private async dispatch(command: Command): Promise<void> {
		const session = this.runtime.session;
		switch (command.type) {
			case 'prompt': {
				let acknowledged = false;
				void session
					.prompt(String(command.message), {
						source: 'rpc',
						preflightResult: (accepted) => {
							if (accepted) {
								acknowledged = true;
								this.success(command);
							}
						}
					})
					.catch((error: unknown) => {
						if (!acknowledged) this.failure(command, error);
					});
				return;
			}
			case 'steer':
				await session.steer(String(command.message));
				return this.success(command);
			case 'follow_up':
				await session.followUp(String(command.message));
				return this.success(command);
			case 'abort':
				await session.abort();
				return this.success(command);
			case 'get_state':
				return this.success(command, this.state(session));
			case 'get_messages':
				return this.success(command, { messages: session.messages });
			case 'get_available_models':
				return this.success(command, { models: await session.modelRuntime.getAvailable() });
			case 'set_model': {
				const model = (await session.modelRuntime.getAvailable()).find(
					(item) => item.provider === command.provider && item.id === command.modelId
				);
				if (!model) throw new Error(`Model not found: ${command.provider}/${command.modelId}`);
				await session.setModel(model);
				return this.success(command, model);
			}
			case 'cycle_model':
				return this.success(command, (await session.cycleModel()) ?? null);
			case 'set_thinking_level':
				session.setThinkingLevel(command.level as ThinkingLevel);
				return this.success(command);
			case 'cycle_thinking_level': {
				const level = session.cycleThinkingLevel();
				return this.success(command, level ? { level } : null);
			}
			case 'compact':
				return this.success(
					command,
					await session.compact(command.customInstructions as string | undefined)
				);
			case 'set_auto_compaction':
				session.setAutoCompactionEnabled(command.enabled === true);
				return this.success(command);
			case 'set_auto_retry':
				session.setAutoRetryEnabled(command.enabled === true);
				return this.success(command);
			case 'abort_retry':
				session.abortRetry();
				return this.success(command);
			case 'get_session_stats':
				return this.success(command, session.getSessionStats());
			case 'new_session': {
				const result = await this.runtime.newSession(
					command.parentSession ? { parentSession: String(command.parentSession) } : undefined
				);
				return this.success(command, result);
			}
			case 'switch_session': {
				const sessionPath = resolve(this.runtime.cwd, String(command.sessionPath));
				const target = SessionManager.open(sessionPath);
				const recordedCwd = target.getCwd();
				if (recordedCwd && resolve(recordedCwd) !== resolve(this.runtime.cwd))
					throw new Error(`Cannot switch to a session from another project: ${recordedCwd}`);
				if (
					!recordedCwd &&
					resolve(target.getSessionDir()) !== resolve(session.sessionManager.getSessionDir())
				)
					throw new Error(
						'A legacy session without cwd must be in the launch project session directory.'
					);
				return this.success(command, await this.runtime.switchSession(sessionPath));
			}
			case 'fork': {
				const result = await this.runtime.fork(String(command.entryId));
				return this.success(command, { text: result.selectedText, cancelled: result.cancelled });
			}
			case 'clone': {
				const leaf = session.sessionManager.getLeafId();
				if (!leaf) throw new Error('Cannot clone session: no current entry selected');
				return this.success(command, await this.runtime.fork(leaf, { position: 'at' }));
			}
			case 'get_fork_messages':
				return this.success(command, { messages: session.getUserMessagesForForking() });
			case 'get_entries': {
				let entries = session.sessionManager.getEntries();
				if (typeof command.since === 'string') {
					const index = entries.findIndex((entry) => entry.id === command.since);
					if (index < 0) throw new Error(`Entry not found: ${command.since}`);
					entries = entries.slice(index + 1);
				}
				return this.success(command, { entries, leafId: session.sessionManager.getLeafId() });
			}
			case 'get_tree':
				return this.success(command, {
					tree: session.sessionManager.getTree(),
					leafId: session.sessionManager.getLeafId()
				});
			case 'set_session_name':
				session.setSessionName(String(command.name).trim());
				return this.success(command);
			case 'get_commands':
				return this.success(command, {
					commands: [
						...session.promptTemplates.map((item) => ({
							name: item.name,
							description: item.description,
							source: 'prompt',
							sourceInfo: item.sourceInfo
						})),
						...session.resourceLoader.getSkills().skills.map((item) => ({
							name: `skill:${item.name}`,
							description: item.description,
							source: 'skill',
							sourceInfo: item.sourceInfo
						}))
					]
				});
			default:
				throw new Error(`Unknown command: ${command.type}`);
		}
	}

	private state(session: AgentSession) {
		return {
			model: session.model,
			thinkingLevel: session.thinkingLevel,
			isStreaming: session.isStreaming,
			isCompacting: session.isCompacting,
			steeringMode: session.steeringMode,
			followUpMode: session.followUpMode,
			sessionFile: session.sessionFile,
			sessionId: session.sessionId,
			sessionName: session.sessionName,
			autoCompactionEnabled: session.autoCompactionEnabled,
			messageCount: session.messages.length,
			pendingMessageCount: session.pendingMessageCount
		};
	}
}
