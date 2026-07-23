/** JSON-compatible values exchanged over the browser WebSocket. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const browserCommands = [
	'prompt',
	'steer',
	'follow_up',
	'abort',
	'get_state',
	'get_messages',
	'get_commands',
	'get_available_models',
	'set_model',
	'cycle_model',
	'set_thinking_level',
	'cycle_thinking_level',
	'compact',
	'set_auto_compaction',
	'set_auto_retry',
	'abort_retry',
	'new_session',
	'switch_session',
	'fork',
	'clone',
	'get_fork_messages',
	'get_entries',
	'get_tree',
	'set_session_name',
	'get_session_stats',
	'get_session_list'
] as const;

export type BrowserCommand = (typeof browserCommands)[number];

export interface CommandFrame {
	kind: 'command';
	id: string;
	command: BrowserCommand;
	params: JsonObject;
}

export interface DialogResponseFrame {
	kind: 'dialog_response';
	id: string;
	value?: JsonValue;
	confirmed?: boolean;
	cancelled?: true;
}

export interface PingFrame {
	kind: 'ping';
	id: string;
}

export type ClientFrame = CommandFrame | DialogResponseFrame | PingFrame;

export interface ResponseFrame {
	kind: 'response';
	id: string;
	command: string;
	success: boolean;
	data?: JsonValue;
	error?: string;
}

export interface EventFrame {
	kind: 'event';
	event: JsonObject;
}

export interface EventsFrame {
	kind: 'events';
	events: JsonObject[];
}

export interface SnapshotFrame {
	kind: 'snapshot';
	snapshotType: string;
	data: JsonValue;
}

export interface ExtensionUiRequestFrame extends JsonObject {
	kind: 'extension_ui_request';
	id: string;
	method: string;
}

export interface ServerStatusFrame {
	kind: 'server_status';
	status: 'pi_starting' | 'pi_unavailable' | 'pi_restarted' | 'server_shutting_down';
	message?: string;
}

export interface PongFrame {
	kind: 'pong';
	id: string;
}

export type ServerFrame =
	| ResponseFrame
	| EventFrame
	| EventsFrame
	| SnapshotFrame
	| ExtensionUiRequestFrame
	| ServerStatusFrame
	| PongFrame;

export interface FrameValidationFailure {
	ok: false;
	error: string;
	id?: string;
	command?: string;
}

export interface FrameValidationSuccess {
	ok: true;
	frame: ClientFrame;
}

export type FrameValidationResult = FrameValidationFailure | FrameValidationSuccess;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isJsonValue);
	return isObject(value) && Object.values(value).every(isJsonValue);
}

function frameId(value: Record<string, unknown>): string | undefined {
	return typeof value.id === 'string' && value.id.length > 0 ? value.id : undefined;
}

/** Validates the common browser frame envelope before server-side command mapping. */
export function parseClientFrame(value: unknown): FrameValidationResult {
	if (!isObject(value)) return { ok: false, error: 'WebSocket frame must be a JSON object.' };

	const id = frameId(value);
	if (typeof value.kind !== 'string')
		return { ok: false, error: 'WebSocket frame requires a kind.', id };
	if (!id) return { ok: false, error: 'WebSocket frame requires a non-empty string id.' };
	if (id.length > 200) return { ok: false, error: 'WebSocket frame id is too long.', id };

	if (value.kind === 'ping') return { ok: true, frame: { kind: 'ping', id } };

	if (value.kind === 'dialog_response') {
		if (value.cancelled !== undefined && value.cancelled !== true) {
			return { ok: false, error: 'cancelled must be true when supplied.', id };
		}
		if (value.confirmed !== undefined && typeof value.confirmed !== 'boolean') {
			return { ok: false, error: 'confirmed must be a boolean.', id };
		}
		if (value.value !== undefined && !isJsonValue(value.value)) {
			return { ok: false, error: 'dialog value must be JSON-compatible.', id };
		}
		const responseValues = [
			value.value !== undefined,
			value.confirmed !== undefined,
			value.cancelled === true
		];
		if (responseValues.filter(Boolean).length !== 1) {
			return { ok: false, error: 'Dialog response requires exactly one response value.', id };
		}
		return {
			ok: true,
			frame: {
				kind: 'dialog_response',
				id,
				...(value.value === undefined ? {} : { value: value.value }),
				...(value.confirmed === undefined ? {} : { confirmed: value.confirmed }),
				...(value.cancelled === undefined ? {} : { cancelled: true })
			}
		};
	}

	if (value.kind !== 'command') {
		return { ok: false, error: `Unsupported WebSocket frame kind: ${value.kind}`, id };
	}
	if (
		typeof value.command !== 'string' ||
		!browserCommands.includes(value.command as BrowserCommand)
	) {
		return {
			ok: false,
			error: `Unsupported command: ${String(value.command)}`,
			id,
			command: String(value.command ?? '')
		};
	}
	if (value.params !== undefined && !isObject(value.params)) {
		return { ok: false, error: 'command params must be an object.', id, command: value.command };
	}
	if (value.params !== undefined && !isJsonValue(value.params)) {
		return {
			ok: false,
			error: 'command params must be JSON-compatible.',
			id,
			command: value.command
		};
	}

	return {
		ok: true,
		frame: {
			kind: 'command',
			id,
			command: value.command as BrowserCommand,
			params: (value.params ?? {}) as JsonObject
		}
	};
}

export function parseServerFrame(value: unknown): ServerFrame | undefined {
	if (!isObject(value) || typeof value.kind !== 'string') return undefined;
	return value as ServerFrame;
}
