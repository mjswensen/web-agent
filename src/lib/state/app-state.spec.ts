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
