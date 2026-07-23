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

export interface LayoutState {
	toolsExpanded: boolean;
	thinkingExpanded: boolean;
	queueOpen: boolean;
	commandPaletteOpen: boolean;
	modelDialogOpen: boolean;
	thinkingDialogOpen: boolean;
	compactDialogOpen: boolean;
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

export interface CompactionState {
	active: boolean;
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
		toolsExpanded: false,
		thinkingExpanded: false,
		queueOpen: false,
		commandPaletteOpen: false,
		modelDialogOpen: false,
		thinkingDialogOpen: false,
		compactDialogOpen: false
	});
	extension: ExtensionState = $state({ dialogs: [], toasts: [], statuses: {}, widgets: {} });
	compaction: CompactionState = $state({ active: false });
	editorText = $state('');
	lastEvent = $state<JsonValue | undefined>(undefined);

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
		}
	}

	setReconnectAttempt(attempt: number): void {
		this.connection.reconnectAttempt = attempt;
	}

	setConnectionError(error: string): void {
		this.connection.status = 'disconnected';
		this.connection.lastError = error;
		this.addToast(error, 'error');
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

	setToolsExpanded(expanded: boolean): void {
		this.layout.toolsExpanded = expanded;
	}

	setThinkingExpanded(expanded: boolean): void {
		this.layout.thinkingExpanded = expanded;
	}

	toggleQueue(): void {
		this.layout.queueOpen = !this.layout.queueOpen;
	}

	private applyEvent(event: JsonObject): void {
		this.lastEvent = event;
		this.conversation = reduceConversationEvent(this.conversation, event);
		if (event.type === 'queue_update') this.queue = queueFrom(event);
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
			if (frame.snapshotType === 'messages') this.conversation = reduceMessagesSnapshot(frame.data);
			if (frame.snapshotType === 'queue') this.queue = queueFrom(frame.data);
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
			if (frame.status === 'pi_unavailable')
				this.setConnectionError(frame.message ?? 'Pi is unavailable.');
		}
	}
}
