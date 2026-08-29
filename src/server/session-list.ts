import { resolve } from 'node:path';
import { SessionManager, type SessionInfo } from '@earendil-works/pi-coding-agent';
import type { JsonValue } from '../lib/client/protocol.js';

export interface SessionManagerLister {
	list(cwd: string, sessionDir?: string): Promise<SessionInfo[]>;
}

export interface SessionListProvider {
	list(): Promise<JsonValue>;
}

export interface SessionListOptions {
	cwd: string;
	sessionDir?: string;
	manager?: SessionManagerLister;
}

function serializeSession(session: SessionInfo): JsonValue {
	return {
		path: session.path,
		id: session.id,
		cwd: session.cwd,
		...(session.name ? { name: session.name } : {}),
		...(session.parentSessionPath ? { parentSessionPath: session.parentSessionPath } : {}),
		created: session.created.toISOString(),
		modified: session.modified.toISOString(),
		messageCount: session.messageCount,
		firstMessage: session.firstMessage
	};
}

/** Lists persisted launch-project sessions without touching the live SDK session. */
export function createSessionListProvider(options: SessionListOptions): SessionListProvider {
	const manager = options.manager ?? SessionManager;
	return {
		async list(): Promise<JsonValue> {
			const sessions = await manager.list(options.cwd, options.sessionDir);
			const launchCwd = options.cwd;
			return {
				sessions: sessions
					.filter((session) => !session.cwd || resolve(session.cwd) === resolve(launchCwd))
					.map(serializeSession)
			};
		}
	};
}
