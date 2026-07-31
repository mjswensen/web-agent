import type { JsonObject, JsonValue, ServerFrame } from '../client/protocol.js';
import {
	initialConversationState,
	reduceConversationEvent,
	reduceMessagesSnapshot,
	type ConversationState
} from './event-reducer.js';
import { deriveFooterValues, type FooterValues } from './footer.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type ExtensionDialogMethod = 'select' | 'confirm' | 'input' | 'editor';
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

export interface ExtensionDialog {
	id: string;
	method: ExtensionDialogMethod;
	title: string;
	message?: string;
	options?: string[];
	placeholder?: string;
	prefill?: string;
	timeout?: number;
}

export interface ExtensionToast {
	id: string;
	message: string;
	type: ToastType;
	category?: 'connection';
}

export interface ExtensionWidget {
	key: string;
	lines: string[];
	placement: 'aboveEditor' | 'belowEditor';
}

export interface ExtensionState {
	dialogs: ExtensionDialog[];
	toasts: ExtensionToast[];
	statuses: Record<string, string>;
	widgets: Record<string, ExtensionWidget>;
	title?: string;
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

export interface PiAvailability {
	available: boolean;
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

function extensionDialog(frame: JsonObject): ExtensionDialog | undefined {
	const method = frame.method;
	if (
		typeof frame.id !== 'string' ||
		(method !== 'select' && method !== 'confirm' && method !== 'input' && method !== 'editor') ||
		typeof frame.title !== 'string'
	)
		return undefined;
	return {
		id: frame.id,
		method,
		title: frame.title,
		...(typeof frame.message === 'string' ? { message: frame.message } : {}),
		...(Array.isArray(frame.options) ? { options: strings(frame.options) } : {}),
		...(typeof frame.placeholder === 'string' ? { placeholder: frame.placeholder } : {}),
		...(typeof frame.prefill === 'string' ? { prefill: frame.prefill } : {}),
		...(typeof frame.timeout === 'number' ? { timeout: frame.timeout } : {})
	};
}

/**
 * Per-layout client state. It is instantiated by the root layout rather than
 * exported as a singleton, preventing one SSR request from leaking into the
 * next request.
 */
export class AppState {
	connection: Connection = $state({
		status: 'disconnected',
		statusMessage: undefined,
		lastError: undefined,
		reconnectAttempt: 0
	});

	snapshots = $state<Record<string, JsonValue>>({});
	conversation: ConversationState = $state(initialConversationState());
	queue: QueueState = $state({ steering: [], followUp: [] });
	layout: LayoutState = $state({
		queueOpen: false,
		commandPaletteOpen: false,
		modelDialogOpen: false,
		thinkingDialogOpen: false,
		compactDialogOpen: false,
		sessionDrawerOpen: false,
		treeDrawerOpen: false,
		gitStatusDrawerOpen: false,
		mobileActionsOpen: false
	});
	extension: ExtensionState = $state({ dialogs: [], toasts: [], statuses: {}, widgets: {} });
	compaction: CompactionState = $state({ active: false });
	pi: PiAvailability = $state({ available: true });
	sessionTransition = $state(false);
	editorText = $state('');
	lastEvent = $state<JsonValue | undefined>(undefined);
	gitDiffStreams = $state<Record<string, GitDiffStream>>({});

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

	get activeDialog(): ExtensionDialog | undefined {
		return this.extension.dialogs[0];
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
	}

	failGitDiff(token: string, message: string): void {
		const stream = this.gitDiffStreams[token];
		this.gitDiffStreams[token] = {
			content: stream?.content ?? '',
			loading: false,
			complete: true,
			error: message
		};
	}

	get widgetsAboveEditor(): ExtensionWidget[] {
		return Object.values(this.extension.widgets).filter(
			(widget) => widget.placement === 'aboveEditor'
		);
	}

	get widgetsBelowEditor(): ExtensionWidget[] {
		return Object.values(this.extension.widgets).filter(
			(widget) => widget.placement === 'belowEditor'
		);
	}

	get isAgentActive(): boolean {
		return this.conversation.isStreaming || this.sessionState?.isStreaming === true;
	}

	get canMutateSession(): boolean {
		return this.connection.status === 'connected' && this.pi.available && !this.sessionTransition;
	}

	get sessionName(): string | undefined {
		const state = this.sessionState;
		return typeof state?.sessionName === 'string' ? state.sessionName : undefined;
	}

	get footer(): FooterValues {
		return deriveFooterValues(this.snapshots.state, this.snapshots.footer_stats);
	}

	get hasQueuedMessages(): boolean {
		return this.queue.steering.length > 0 || this.queue.followUp.length > 0;
	}

	setConnection(status: ConnectionStatus, statusMessage?: string): void {
		this.connection.status = status;
		this.connection.statusMessage = statusMessage;
		if (status === 'connected') {
			this.connection.lastError = undefined;
			this.connection.reconnectAttempt = 0;
			this.extension.toasts = this.extension.toasts.filter(
				(toast) => toast.category !== 'connection'
			);
		}
	}

	setReconnectAttempt(attempt: number): void {
		this.connection.reconnectAttempt = attempt;
	}

	setConnectionError(error: string): void {
		this.connection.status = 'disconnected';
		this.connection.lastError = error;
		this.extension.toasts = [
			...this.extension.toasts.filter((toast) => toast.category !== 'connection'),
			{
				id: 'websocket-connection-error',
				message: error,
				type: 'error',
				category: 'connection'
			}
		];
	}

	addToast(message: string, type: ToastType = 'info'): void {
		this.extension.toasts = [
			...this.extension.toasts,
			{ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${message}`, message, type }
		];
	}

	dismissToast(id: string): void {
		this.extension.toasts = this.extension.toasts.filter((toast) => toast.id !== id);
	}

	removeDialog(id: string): void {
		this.extension.dialogs = this.extension.dialogs.filter((dialog) => dialog.id !== id);
	}

	toggleQueue(): void {
		this.layout.queueOpen = !this.layout.queueOpen;
	}

	private applyEvent(event: JsonObject): void {
		this.lastEvent = event;
		this.conversation = reduceConversationEvent(this.conversation, event);
		if (event.type === 'queue_update') this.queue = queueFrom(event);
		if (event.type === 'session_changed') {
			this.sessionTransition = true;
			this.conversation = initialConversationState();
			this.queue = { steering: [], followUp: [] };
			this.extension.dialogs = [];
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

	private applyExtensionRequest(frame: JsonObject): void {
		switch (frame.method) {
			case 'select':
			case 'confirm':
			case 'input':
			case 'editor': {
				const dialog = extensionDialog(frame);
				if (dialog) this.extension.dialogs = [...this.extension.dialogs, dialog];
				break;
			}
			case 'notify':
				if (typeof frame.message === 'string') {
					this.addToast(
						frame.message,
						frame.notifyType === 'warning' || frame.notifyType === 'error'
							? frame.notifyType
							: 'info'
					);
				}
				break;
			case 'setStatus':
				if (typeof frame.statusKey === 'string') {
					if (typeof frame.statusText === 'string')
						this.extension.statuses[frame.statusKey] = frame.statusText;
					else delete this.extension.statuses[frame.statusKey];
				}
				break;
			case 'setWidget':
				if (typeof frame.widgetKey === 'string') {
					if (Array.isArray(frame.widgetLines)) {
						this.extension.widgets[frame.widgetKey] = {
							key: frame.widgetKey,
							lines: strings(frame.widgetLines),
							placement: frame.widgetPlacement === 'belowEditor' ? 'belowEditor' : 'aboveEditor'
						};
					} else delete this.extension.widgets[frame.widgetKey];
				}
				break;
			case 'setTitle':
				if (typeof frame.title === 'string') this.extension.title = frame.title;
				break;
			case 'set_editor_text':
				if (typeof frame.text === 'string') this.editorText = frame.text;
				break;
		}
	}

	receive(frame: ServerFrame): void {
		if (frame.kind === 'snapshot') {
			this.snapshots[frame.snapshotType] = frame.data;
			if (frame.snapshotType === 'messages') {
				this.conversation = reduceMessagesSnapshot(frame.data);
				this.sessionTransition = false;
			}
			if (frame.snapshotType === 'queue') this.queue = queueFrom(frame.data);
			return;
		}
		if (frame.kind === 'git_diff_chunk') {
			const stream = this.gitDiffStreams[frame.token];
			if (!stream) return;
			this.gitDiffStreams[frame.token] = {
				content: stream.content + (frame.chunk ?? ''),
				loading: frame.done ? false : stream.loading,
				complete: frame.done === true || stream.complete,
				...(frame.error ? { error: frame.error } : stream.error ? { error: stream.error } : {})
			};
			return;
		}
		if (frame.kind === 'event') {
			this.applyEvent(frame.event);
			return;
		}
		if (frame.kind === 'events') {
			for (const event of frame.events) this.applyEvent(event);
			return;
		}
		if (frame.kind === 'extension_ui_request') {
			this.applyExtensionRequest(frame);
			return;
		}
		if (frame.kind === 'server_status') {
			this.connection.statusMessage = frame.message ?? frame.status;
			if (frame.status === 'pi_unavailable') {
				this.pi = { available: false, message: frame.message ?? 'Pi is unavailable.' };
			}
			if (frame.status === 'pi_restarted') this.pi = { available: true };
		}
	}
}
