import { randomUUID } from 'node:crypto';
import type {
	BrowserCommand,
	ClientFrame,
	CommandFrame,
	DialogResponseFrame,
	JsonObject,
	JsonValue,
	ResponseFrame,
	ServerFrame,
	SnapshotFrame
} from '../lib/client/protocol.js';
import { EventBatcher } from './event-batcher.js';
import type { PiProcess } from './pi-process.js';

export interface BrokerClient {
	id: string;
	send(frame: ServerFrame): void;
}

export interface PiRpcTransport {
	send(command: unknown): Promise<void>;
	onRecord(listener: (record: unknown) => void): () => void;
	onProtocolError(listener: (error: Error) => void): () => void;
	onExit(
		listener: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void
	): () => void;
}

interface PendingRequest {
	clientId: string;
	browserId: string;
	browserCommand: BrowserCommand;
}

export class CommandValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CommandValidationError';
	}
}

function asObject(value: JsonValue | undefined): JsonObject {
	if (value && typeof value === 'object' && !Array.isArray(value)) return value;
	return {};
}

function requiredString(params: JsonObject, key: string): string {
	const value = params[key];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new CommandValidationError(`${key} must be a non-empty string.`);
	}
	return value;
}

function optionalString(params: JsonObject, key: string): string | undefined {
	const value = params[key];
	if (value === undefined) return undefined;
	if (typeof value !== 'string') throw new CommandValidationError(`${key} must be a string.`);
	return value;
}

function requiredBoolean(params: JsonObject, key: string): boolean {
	if (typeof params[key] !== 'boolean')
		throw new CommandValidationError(`${key} must be a boolean.`);
	return params[key];
}

/** Converts the public browser command names and parameter objects to Pi's RPC schema. */
export function mapCommandToPi(frame: CommandFrame, id: string): JsonObject {
	const params = asObject(frame.params);
	const command = frame.command;
	const base: JsonObject = { id, type: command };

	switch (command) {
		case 'prompt':
		case 'steer':
		case 'follow_up':
			return { ...base, message: requiredString(params, 'message') };
		case 'set_model':
			return {
				...base,
				provider: requiredString(params, 'provider'),
				modelId: requiredString(params, 'modelId')
			};
		case 'set_thinking_level':
			return { ...base, level: requiredString(params, 'level') };
		case 'compact': {
			const customInstructions = optionalString(params, 'customInstructions');
			return customInstructions === undefined ? base : { ...base, customInstructions };
		}
		case 'set_auto_compaction':
		case 'set_auto_retry':
			return { ...base, enabled: requiredBoolean(params, 'enabled') };
		case 'new_session': {
			const parentSession = optionalString(params, 'parentSession');
			return parentSession === undefined ? base : { ...base, parentSession };
		}
		case 'switch_session':
			return { ...base, sessionPath: requiredString(params, 'sessionPath') };
		case 'fork':
			return { ...base, entryId: requiredString(params, 'entryId') };
		case 'get_entries': {
			const since = optionalString(params, 'since');
			return since === undefined ? base : { ...base, since };
		}
		case 'set_session_name':
			return { ...base, name: requiredString(params, 'name') };
		default:
			return base;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPiResponse(record: Record<string, unknown>): boolean {
	return (
		record.type === 'response' &&
		typeof record.id === 'string' &&
		typeof record.success === 'boolean'
	);
}

function toJsonValue(value: unknown): JsonValue {
	// Pi RPC values come from JSONL and are JSON-compatible. The fallback keeps
	// the server resilient to a malformed third-party extension response.
	return value === undefined ? null : (value as JsonValue);
}

/**
 * Owns browser/Pi request correlation, broadcast fan-out, and reconnectable
 * snapshots. It contains no WebSocket implementation, so its protocol logic is
 * deterministic and unit-testable.
 */
export class RpcBroker {
	private readonly clients = new Map<string, BrokerClient>();
	private readonly pending = new Map<string, PendingRequest>();
	private readonly snapshots = new Map<string, JsonValue>();
	private nextRequestNumber = 0;
	private readonly detach: Array<() => void>;
	private readonly eventBatcher: EventBatcher;

	constructor(private readonly pi: PiRpcTransport | PiProcess) {
		this.eventBatcher = new EventBatcher((events) => {
			if (events.length === 1) this.broadcast({ kind: 'event', event: events[0] });
			else this.broadcast({ kind: 'events', events });
		});
		this.detach = [
			pi.onRecord((record) => this.handlePiRecord(record)),
			pi.onProtocolError((error) => this.broadcastStatus('pi_unavailable', error.message)),
			pi.onExit((exit) =>
				this.broadcastStatus(
					'pi_unavailable',
					`Pi exited (code ${exit.code ?? 'none'}, signal ${exit.signal ?? 'none'}).`
				)
			)
		];
	}

	announceStatus(
		status: 'pi_starting' | 'pi_unavailable' | 'pi_restarted' | 'server_shutting_down',
		message?: string
	): void {
		this.broadcast({ kind: 'server_status', status, ...(message ? { message } : {}) });
	}

	addClient(client: BrokerClient): () => void {
		this.clients.set(client.id, client);
		for (const [snapshotType, data] of this.snapshots) {
			client.send({ kind: 'snapshot', snapshotType, data });
		}
		return () => this.clients.delete(client.id);
	}

	dispose(): void {
		for (const unsubscribe of this.detach) unsubscribe();
		this.eventBatcher.dispose();
		this.clients.clear();
		this.pending.clear();
	}

	async handleClientFrame(clientId: string, frame: ClientFrame): Promise<void> {
		if (!this.clients.has(clientId)) return;
		if (frame.kind === 'ping') {
			this.send(clientId, { kind: 'pong', id: frame.id });
			return;
		}
		if (frame.kind === 'dialog_response') {
			await this.forwardDialogResponse(clientId, frame);
			return;
		}
		await this.forwardCommand(clientId, frame);
	}

	private async forwardCommand(clientId: string, frame: CommandFrame): Promise<void> {
		const rpcId = `web-agent-${++this.nextRequestNumber}-${randomUUID()}`;
		let command: JsonObject;
		try {
			command = mapCommandToPi(frame, rpcId);
		} catch (error) {
			this.failure(clientId, frame.id, frame.command, error);
			return;
		}

		this.pending.set(rpcId, {
			clientId,
			browserId: frame.id,
			browserCommand: frame.command
		});
		try {
			await this.pi.send(command);
		} catch (error) {
			this.pending.delete(rpcId);
			this.failure(clientId, frame.id, frame.command, error);
		}
	}

	private async forwardDialogResponse(clientId: string, frame: DialogResponseFrame): Promise<void> {
		const command: JsonObject = { type: 'extension_ui_response', id: frame.id };
		if (frame.cancelled) command.cancelled = true;
		else if (frame.confirmed !== undefined) command.confirmed = frame.confirmed;
		else if (frame.value !== undefined) command.value = frame.value;
		else {
			this.failure(
				clientId,
				frame.id,
				'dialog_response',
				new CommandValidationError(
					'Dialog response requires a value, confirmation, or cancellation.'
				)
			);
			return;
		}

		try {
			await this.pi.send(command);
		} catch (error) {
			this.failure(clientId, frame.id, 'dialog_response', error);
		}
	}

	private handlePiRecord(record: unknown): void {
		if (!isObject(record)) {
			this.broadcastStatus('pi_unavailable', 'Pi emitted a non-object protocol record.');
			return;
		}
		if (isPiResponse(record)) {
			this.handlePiResponse(record);
			return;
		}
		if (record.type === 'extension_ui_request') {
			this.eventBatcher.flush();
			if (typeof record.id !== 'string' || typeof record.method !== 'string') {
				this.broadcastStatus('pi_unavailable', 'Pi emitted an invalid extension UI request.');
				return;
			}
			this.broadcast({ kind: 'extension_ui_request', ...(record as JsonObject) } as ServerFrame);
			return;
		}
		if (typeof record.type !== 'string') {
			this.broadcastStatus('pi_unavailable', 'Pi emitted a protocol record without a type.');
			return;
		}

		const event = record as JsonObject;
		if (record.type === 'queue_update') this.storeSnapshot('queue', event);
		this.eventBatcher.push(event);
	}

	private handlePiResponse(response: Record<string, unknown>): void {
		const request = this.pending.get(response.id as string);
		if (!request) return;
		this.pending.delete(response.id as string);

		const success = response.success === true;
		const frame: ResponseFrame = {
			kind: 'response',
			id: request.browserId,
			command: request.browserCommand,
			success,
			...(success && response.data !== undefined ? { data: toJsonValue(response.data) } : {}),
			...(!success
				? {
						error: typeof response.error === 'string' ? response.error : 'Pi rejected the command.'
					}
				: {})
		};
		this.send(request.clientId, frame);

		if (success && response.data !== undefined) {
			const snapshotType = snapshotTypeFor(request.browserCommand);
			if (snapshotType) this.storeSnapshot(snapshotType, toJsonValue(response.data));
		}
	}

	private storeSnapshot(snapshotType: string, data: JsonValue): void {
		this.snapshots.set(snapshotType, data);
		this.broadcast({ kind: 'snapshot', snapshotType, data } satisfies SnapshotFrame);
	}

	private failure(clientId: string, id: string, command: string, error: unknown): void {
		this.send(clientId, {
			kind: 'response',
			id,
			command,
			success: false,
			error: error instanceof Error ? error.message : String(error)
		});
	}

	private send(clientId: string, frame: ServerFrame): void {
		this.clients.get(clientId)?.send(frame);
	}

	private broadcast(frame: ServerFrame): void {
		for (const client of this.clients.values()) client.send(frame);
	}

	private broadcastStatus(status: 'pi_unavailable', message: string): void {
		this.eventBatcher.flush();
		this.announceStatus(status, message);
	}
}

function snapshotTypeFor(command: BrowserCommand): string | undefined {
	switch (command) {
		case 'get_state':
			return 'state';
		case 'get_messages':
			return 'messages';
		case 'get_session_stats':
			return 'footer_stats';
		case 'get_commands':
			return 'commands';
		case 'get_available_models':
			return 'models';
		default:
			return undefined;
	}
}
