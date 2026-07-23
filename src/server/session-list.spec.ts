import { describe, expect, it } from 'vitest';
import { createSessionListProvider } from './session-list.js';

describe('session list adapter', () => {
	it('lists the current project with the configured session directory and serializes Dates', async () => {
		const list = async (cwd: string, sessionDir?: string) => {
			expect(cwd).toBe('/project');
			expect(sessionDir).toBe('/sessions');
			return [
				{
					path: '/sessions/one.jsonl',
					id: 'one',
					cwd,
					name: 'A session',
					created: new Date('2025-01-01T00:00:00.000Z'),
					modified: new Date('2025-01-02T00:00:00.000Z'),
					messageCount: 3,
					firstMessage: 'Hello',
					allMessagesText: 'Hello world'
				}
			];
		};
		const provider = createSessionListProvider({
			cwd: '/project',
			sessionDir: '/sessions',
			manager: { list }
		});

		await expect(provider.list()).resolves.toEqual({
			sessions: [
				{
					path: '/sessions/one.jsonl',
					id: 'one',
					cwd: '/project',
					name: 'A session',
					created: '2025-01-01T00:00:00.000Z',
					modified: '2025-01-02T00:00:00.000Z',
					messageCount: 3,
					firstMessage: 'Hello'
				}
			]
		});
	});
});
