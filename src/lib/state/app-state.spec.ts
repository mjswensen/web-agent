import { describe, expect, it } from 'vitest';
import { AppState } from './app-state.svelte.js';

describe('extension UI state', () => {
	it('reduces extension UI requests into dialogs, widgets, statuses, editor text, and toasts', () => {
		const app = new AppState();
		app.receive({
			kind: 'extension_ui_request',
			id: 'dialog-1',
			method: 'confirm',
			title: 'Continue?',
			message: 'Proceed with the tool?'
		});
		app.receive({
			kind: 'extension_ui_request',
			id: 'status-1',
			method: 'setStatus',
			statusKey: 'review',
			statusText: 'Reviewing changes'
		});
		app.receive({
			kind: 'extension_ui_request',
			id: 'widget-1',
			method: 'setWidget',
			widgetKey: 'hint',
			widgetLines: ['Run tests before committing'],
			widgetPlacement: 'belowEditor'
		});
		app.receive({
			kind: 'extension_ui_request',
			id: 'title-1',
			method: 'setTitle',
			title: 'Pi working'
		});
		app.receive({
			kind: 'extension_ui_request',
			id: 'editor-1',
			method: 'set_editor_text',
			text: 'Draft from extension'
		});
		app.receive({
			kind: 'extension_ui_request',
			id: 'toast-1',
			method: 'notify',
			message: 'Saved',
			notifyType: 'info'
		});

		expect(app.activeDialog).toMatchObject({
			id: 'dialog-1',
			method: 'confirm',
			title: 'Continue?'
		});
		expect(app.extension.statuses).toEqual({ review: 'Reviewing changes' });
		expect(app.widgetsBelowEditor).toEqual([
			{ key: 'hint', lines: ['Run tests before committing'], placement: 'belowEditor' }
		]);
		expect(app.extension.title).toBe('Pi working');
		expect(app.editorText).toBe('Draft from extension');
		expect(app.extension.toasts).toHaveLength(1);
	});

	it('exposes a validated Git status snapshot', () => {
		const app = new AppState();
		app.receive({
			kind: 'snapshot',
			snapshotType: 'git_status',
			data: {
				state: 'ready',
				repositoryRoot: '/repo',
				branch: { name: 'main', detached: false },
				refreshedAt: '2026-01-01T00:00:00.000Z',
				files: [{ path: 'new file.txt', untracked: true, unstagedDiff: '+content' }]
			}
		});
		expect(app.gitStatus).toMatchObject({
			state: 'ready',
			branch: { name: 'main' },
			files: [{ path: 'new file.txt', untracked: true, unstagedDiff: '+content' }]
		});
	});

	it('appends full Git diff chunks to the requesting diff stream', () => {
		const app = new AppState();
		app.startGitDiff('opaque-token');
		app.receive({ kind: 'git_diff_chunk', token: 'opaque-token', chunk: 'first\n' });
		app.receive({ kind: 'git_diff_chunk', token: 'opaque-token', chunk: 'second\n', done: true });
		expect(app.gitDiff('opaque-token')).toEqual({
			content: 'first\nsecond\n',
			loading: false,
			complete: true
		});
	});

	it('deduplicates connection failures and removes only those toasts on recovery', () => {
		const app = new AppState();
		app.addToast('Unrelated extension notice');
		app.setConnectionError('First socket failure');
		app.setConnectionError('Second socket failure');
		expect(app.extension.toasts).toHaveLength(2);
		expect(app.extension.toasts.find((toast) => toast.category === 'connection')?.message).toBe(
			'Second socket failure'
		);
		app.setConnection('connected');
		expect(app.extension.toasts).toHaveLength(1);
		expect(app.extension.toasts[0]?.message).toBe('Unrelated extension notice');
	});

	it('preserves the socket state while surfacing Pi recovery status', () => {
		const app = new AppState();
		app.setConnection('connected');
		app.receive({
			kind: 'server_status',
			status: 'pi_unavailable',
			message: 'Pi exited (code 1).'
		});
		expect(app.connection.status).toBe('connected');
		expect(app.pi).toEqual({ available: false, message: 'Pi exited (code 1).' });
		app.receive({ kind: 'server_status', status: 'pi_restarted' });
		expect(app.pi).toEqual({ available: true });
	});

	it('reads command and model snapshots for the respective dialogs', () => {
		const app = new AppState();
		app.receive({
			kind: 'snapshot',
			snapshotType: 'commands',
			data: { commands: [{ name: 'review', source: 'extension' }] }
		});
		app.receive({
			kind: 'snapshot',
			snapshotType: 'models',
			data: { models: [{ provider: 'test', id: 'model-a' }] }
		});

		expect(app.commands).toEqual([{ name: 'review', source: 'extension' }]);
		expect(app.models).toEqual([{ provider: 'test', id: 'model-a' }]);
	});
});
