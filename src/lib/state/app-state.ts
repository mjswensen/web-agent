import type { JsonObject, JsonValue, ServerFrame } from '../client/protocol.js';
import {
	initialConversationState,
	reduceConversationEvent,
	reduceMessagesSnapshot,
	type ConversationState
} from './event-reducer.js';
import { deriveFooterValues, type FooterValues } from './footer.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type ToastType = 'info' | 'warning' | 'error';

type Connection = {
	status: ConnectionStatus;
	statusMessage: string | undefined;
	lastError: string | undefined;
	reconnectAttempt: number;
};

export interface QueueState {
	steering: string[];
	followUp: string[];
}

export interface GitFileStatus {
	path: string;
	originalPath?: string;
	indexStatus?: string;
	worktreeStatus?: string;
	stagedDiff?: string;
	unstagedDiff?: string;
	stagedDiffError?: string;
	unstagedDiffError?: string;
	stagedDiffToken?: string;
	unstagedDiffToken?: string;
	stagedDiffTruncated?: boolean;
	unstagedDiffTruncated?: boolean;
	untracked?: boolean;
	conflicted?: boolean;
	binary?: boolean;
}

export type GitStatusSnapshot =
	| {
			state: 'ready';
			repositoryRoot: string;
			branch: { name: string; detached: boolean; oid?: string };
			refreshedAt: string;
			files: GitFileStatus[];
	  }
	| { state: 'not_repository'; refreshedAt: string }
	| { state: 'error'; refreshedAt: string; message: string };

export interface LayoutState {
	queueOpen: boolean;
	commandPaletteOpen: boolean;
	modelDialogOpen: boolean;
	thinkingDialogOpen: boolean;
	compactDialogOpen: boolean;
	sessionDrawerOpen: boolean;
	treeDrawerOpen: boolean;
	gitStatusDrawerOpen: boolean;
	mobileActionsOpen: boolean;
}

export interface ToastNotification {
	id: string;
	message: string;
	type: ToastType;
	category?: 'connection';
}

export interface NotificationState {
	toasts: ToastNotification[];
}

export interface GitDiffStream {
	content: string;
	loading: boolean;
	complete: boolean;
	error?: string;
}

export interface CompactionState {
	active: boolean;
	message?: string;
}

export interface AgentAvailability {
	status: 'ready' | 'unconfigured' | 'unavailable';
	message?: string;
}

function asObject(value: JsonValue | undefined): JsonObject | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function strings(value: JsonValue | undefined): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

function queueFrom(value: JsonValue): QueueState {
	const queue = asObject(value);
	return {
		steering: strings(queue?.steering),
		followUp: strings(queue?.followUp)
	};
}

/**
 * Per-request client state. Works with React via useSyncExternalStore.
 * Call subscribe() to register a listener; any mutation notifies all listeners.
 */
export class AppState {
	private listeners = new Set<() => void>();
	private version = 0;

	connection: Connection = {
		status: 'disconnected',
		statusMessage: undefined,
		lastError: undefined,
		reconnectAttempt: 0
	};

	snapshots: Record<string, JsonValue> = {};
	conversation: ConversationState = initialConversationState();
	queue: QueueState = { steering: [], followUp: [] };
	layout: LayoutState = {
		queueOpen: false,
		commandPaletteOpen: false,
		modelDialogOpen: false,
		thinkingDialogOpen: false,
		compactDialogOpen: false,
		sessionDrawerOpen: false,
		treeDrawerOpen: false,
		gitStatusDrawerOpen: false,
		mobileActionsOpen: false
	};
	notifications: NotificationState = { toasts: [] };
	compaction: CompactionState = { active: false };
	agent: AgentAvailability = { status: 'ready' };
	sessionTransition = false;
	editorText = '';
	lastEvent: JsonValue | undefined = undefined;
	gitDiffStreams: Record<string, GitDiffStream> = {};

	/** Subscribe to state changes (for useSyncExternalStore). */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Get a snapshot version (for useSyncExternalStore). */
	getSnapshot(): number {
		return this.version;
	}

	private notify(): void {
		this.version++;
		for (const listener of this.listeners) listener();
	}

	get sessionState(): JsonObject | undefined {
		return asObject(this.snapshots.state);
	}

	get commands(): JsonObject[] {
		const data = asObject(this.snapshots.commands);
		return Array.isArray(data?.commands)
			? data.commands.filter((command): command is JsonObject => asObject(command) !== undefined)
			: [];
	}

	get models(): JsonObject[] {
		const data = asObject(this.snapshots.models);
		return Array.isArray(data?.models)
			? data.models.filter((model): model is JsonObject => asObject(model) !== undefined)
			: [];
	}

	get sessionList(): JsonObject[] {
		const data = asObject(this.snapshots.session_list);
		return Array.isArray(data?.sessions)
			? data.sessions.filter((session): session is JsonObject => asObject(session) !== undefined)
			: [];
	}

	get tree(): JsonObject[] {
		const data = asObject(this.snapshots.tree);
		return Array.isArray(data?.tree)
			? data.tree.filter((node): node is JsonObject => asObject(node) !== undefined)
			: [];
	}

	get activeTreeLeafId(): string | undefined {
		const data = asObject(this.snapshots.tree);
		return typeof data?.leafId === 'string' ? data.leafId : undefined;
	}

	get gitStatus(): GitStatusSnapshot | undefined {
		const data = asObject(this.snapshots.git_status);
		if (!data || typeof data.state !== 'string' || typeof data.refreshedAt !== 'string')
			return undefined;
		if (data.state === 'not_repository')
			return { state: 'not_repository', refreshedAt: data.refreshedAt };
		if (data.state === 'error' && typeof data.message === 'string') {
			return { state: 'error', refreshedAt: data.refreshedAt, message: data.message };
		}
		if (
			data.state !== 'ready' ||
			typeof data.repositoryRoot !== 'string' ||
			!asObject(data.branch) ||
			typeof asObject(data.branch)?.name !== 'string' ||
			typeof asObject(data.branch)?.detached !== 'boolean' ||
			!Array.isArray(data.files)
		)
			return undefined;
		const branch = asObject(data.branch)!;
		return {
			state: 'ready',
			repositoryRoot: data.repositoryRoot,
			branch: {
				name: branch.name as string,
				detached: branch.detached as boolean,
				...(typeof branch.oid === 'string' ? { oid: branch.oid } : {})
			},
			refreshedAt: data.refreshedAt,
			files: data.files
				.filter((file): file is JsonObject => asObject(file) !== undefined)
				.filter((file) => typeof file.path === 'string')
				.map((file) => ({
					path: file.path as string,
					...(typeof file.originalPath === 'string' ? { originalPath: file.originalPath } : {}),
					...(typeof file.indexStatus === 'string' ? { indexStatus: file.indexStatus } : {}),
					...(typeof file.worktreeStatus === 'string'
						? { worktreeStatus: file.worktreeStatus }
						: {}),
					...(typeof file.stagedDiff === 'string' ? { stagedDiff: file.stagedDiff } : {}),
					...(typeof file.unstagedDiff === 'string' ? { unstagedDiff: file.unstagedDiff } : {}),
					...(typeof file.stagedDiffError === 'string'
						? { stagedDiffError: file.stagedDiffError }
						: {}),
					...(typeof file.unstagedDiffError === 'string'
						? { unstagedDiffError: file.unstagedDiffError }
						: {}),
					...(typeof file.stagedDiffToken === 'string'
						? { stagedDiffToken: file.stagedDiffToken }
						: {}),
					...(typeof file.unstagedDiffToken === 'string'
						? { unstagedDiffToken: file.unstagedDiffToken }
						: {}),
					...(file.stagedDiffTruncated === true ? { stagedDiffTruncated: true } : {}),
					...(file.unstagedDiffTruncated === true ? { unstagedDiffTruncated: true } : {}),
					...(file.untracked === true ? { untracked: true } : {}),
					...(file.conflicted === true ? { conflicted: true } : {}),
					...(file.binary === true ? { binary: true } : {})
				}))
				.sort((first, second) => first.path.localeCompare(second.path))
		};
	}

	gitDiff(token: string | undefined): GitDiffStream | undefined {
		return token ? this.gitDiffStreams[token] : undefined;
	}

	startGitDiff(token: string): void {
		this.gitDiffStreams[token] = { content: '', loading: true, complete: false };
		this.notify();
	}

	failGitDiff(token: string, message: string): void {
		const stream = this.gitDiffStreams[token];
		this.gitDiffStreams[token] = {
			content: stream?.content ?? '',
			loading: false,
			complete: true,
			error: message
		};
		this.notify();
	}

	get isAgentActive(): boolean {
		return this.conversation.isStreaming || this.sessionState?.isStreaming === true;
	}

	get canMutateSession(): boolean {
		return (
			this.connection.status === 'connected' &&
			this.agent.status !== 'unavailable' &&
			!this.sessionTransition
		);
	}

	get activeSession(): JsonObject | undefined {
		const state = this.sessionState;
		return this.sessionList.find(
			(session) =>
				(typeof state?.sessionFile === 'string' && session.path === state.sessionFile) ||
				(typeof state?.sessionId === 'string' && session.id === state.sessionId)
		);
	}

	get sessionName(): string | undefined {
		const stateName = this.sessionState?.sessionName;
		if (typeof stateName === 'string' && stateName) return stateName;
		const persistedName = this.activeSession?.name;
		return typeof persistedName === 'string' && persistedName ? persistedName : undefined;
	}

	get sessionTitle(): string | undefined {
		if (this.sessionName) return this.sessionName;
		const firstMessage = this.activeSession?.firstMessage;
		if (typeof firstMessage === 'string' && firstMessage) return firstMessage;
		const id = this.activeSession?.id;
		return typeof id === 'string' && id ? id : undefined;
	}

	get footer(): FooterValues {
		return deriveFooterValues(this.snapshots.state, this.snapshots.footer_stats);
	}

	get hasQueuedMessages(): boolean {
		return this.queue.steering.length > 0 || this.queue.followUp.length > 0;
	}

	setConnection(status: ConnectionStatus, statusMessage?: string): void {
		this.connection = {
			...this.connection,
			status,
			statusMessage,
			...(status === 'connected' ? { lastError: undefined, reconnectAttempt: 0 } : {})
		};
		if (status === 'connected') {
			this.notifications = {
				...this.notifications,
				toasts: this.notifications.toasts.filter((toast) => toast.category !== 'connection')
			};
		}
		this.notify();
	}

	setReconnectAttempt(attempt: number): void {
		this.connection = { ...this.connection, reconnectAttempt: attempt };
		this.notify();
	}

	setConnectionError(error: string): void {
		this.connection = { ...this.connection, status: 'disconnected', lastError: error };
		this.notifications = {
			...this.notifications,
			toasts: [
				...this.notifications.toasts.filter((toast) => toast.category !== 'connection'),
				{
					id: 'websocket-connection-error',
					message: error,
					type: 'error',
					category: 'connection'
				}
			]
		};
		this.notify();
	}

	addToast(message: string, type: ToastType = 'info'): void {
		this.notifications = {
			...this.notifications,
			toasts: [
				...this.notifications.toasts,
				{ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${message}`, message, type }
			]
		};
		this.notify();
	}

	dismissToast(id: string): void {
		this.notifications = {
			...this.notifications,
			toasts: this.notifications.toasts.filter((toast) => toast.id !== id)
		};
		this.notify();
	}

	setEditorText(text: string): void {
		this.editorText = text;
		this.notify();
	}

	setLayout(key: keyof LayoutState, value: boolean): void {
		this.layout = { ...this.layout, [key]: value };
		this.notify();
	}

	toggleQueue(): void {
		this.layout = { ...this.layout, queueOpen: !this.layout.queueOpen };
		this.notify();
	}

	private applyEvent(event: JsonObject): void {
		this.lastEvent = event;
		this.conversation = reduceConversationEvent(this.conversation, event);
		if (event.type === 'queue_update') this.queue = queueFrom(event);
		if (event.type === 'session_changed') {
			this.sessionTransition = true;
			this.conversation = initialConversationState();
			this.queue = { steering: [], followUp: [] };
		}
		if (event.type === 'compaction_start') {
			this.compaction = { active: true, message: 'Compacting conversation…' };
		}
		if (event.type === 'compaction_end') {
			this.compaction = {
				active: false,
				message: event.aborted === true ? 'Compaction cancelled.' : 'Compaction finished.'
			};
		}
	}

	receive(frame: ServerFrame): void {
		if (frame.kind === 'snapshot') {
			this.snapshots = { ...this.snapshots, [frame.snapshotType]: frame.data };
			if (frame.snapshotType === 'messages') {
				this.conversation = reduceMessagesSnapshot(frame.data);
				this.sessionTransition = false;
			}
			if (frame.snapshotType === 'queue') this.queue = queueFrom(frame.data);
			this.notify();
			return;
		}
		if (frame.kind === 'git_diff_chunk') {
			const stream = this.gitDiffStreams[frame.token];
			if (!stream) return;
			this.gitDiffStreams = {
				...this.gitDiffStreams,
				[frame.token]: {
					content: stream.content + (frame.chunk ?? ''),
					loading: frame.done ? false : stream.loading,
					complete: frame.done === true || stream.complete,
					...(frame.error ? { error: frame.error } : stream.error ? { error: stream.error } : {})
				}
			};
			this.notify();
			return;
		}
		if (frame.kind === 'event') {
			this.applyEvent(frame.event);
			this.notify();
			return;
		}
		if (frame.kind === 'events') {
			for (const event of frame.events) this.applyEvent(event);
			this.notify();
			return;
		}
		if (frame.kind === 'server_status') {
			this.connection = {
				...this.connection,
				statusMessage: frame.message ?? frame.status
			};
			if (frame.status === 'agent_ready') this.agent = { status: 'ready' };
			if (frame.status === 'agent_unconfigured')
				this.agent = {
					status: 'unconfigured',
					message: frame.message ?? 'Configure provider credentials to send messages.'
				};
			if (frame.status === 'agent_unavailable')
				this.agent = {
					status: 'unavailable',
					message: frame.message ?? 'The agent is unavailable. Restart Web Agent.'
				};
			this.notify();
		}
	}
}
