import { describe, expect, it } from 'vitest';
import { AppState } from './app-state.js';

describe('AppState session name', () => {
	it('uses the name from the live Pi state', () => {
		const state = new AppState();
		state.receive({
			kind: 'snapshot',
			snapshotType: 'state',
			data: { sessionFile: '/sessions/active.jsonl', sessionName: 'Live session name' }
		});

		expect(state.sessionName).toBe('Live session name');
	});

	it('falls back to the matching persisted session when Pi state omits the name', () => {
		const state = new AppState();
		state.receive({
			kind: 'snapshot',
			snapshotType: 'state',
			data: { sessionFile: '/sessions/active.jsonl', sessionId: 'active' }
		});
		state.receive({
			kind: 'snapshot',
			snapshotType: 'session_list',
			data: {
				sessions: [
					{ path: '/sessions/other.jsonl', id: 'other', name: 'Other session' },
					{ path: '/sessions/active.jsonl', id: 'active', name: 'Current session' }
				]
			}
		});

		expect(state.sessionName).toBe('Current session');
		expect(state.sessionTitle).toBe('Current session');
	});

	it('uses the first message as the title for an unnamed persisted session', () => {
		const state = new AppState();
		state.receive({
			kind: 'snapshot',
			snapshotType: 'state',
			data: { sessionFile: '/sessions/active.jsonl' }
		});
		state.receive({
			kind: 'snapshot',
			snapshotType: 'session_list',
			data: {
				sessions: [
					{
						path: '/sessions/active.jsonl',
						id: 'active',
						firstMessage: 'Investigate the header session title'
					}
				]
			}
		});

		expect(state.sessionName).toBeUndefined();
		expect(state.sessionTitle).toBe('Investigate the header session title');
	});
});
