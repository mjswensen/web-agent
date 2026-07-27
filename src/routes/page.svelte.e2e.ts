import { expect, test } from '@playwright/test';

const fakeSocket = () => {
	class FakeWebSocket extends EventTarget {
		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSED = 3;
		readyState = FakeWebSocket.CONNECTING;
		onopen: ((event: Event) => void) | null = null;
		onmessage: ((event: MessageEvent) => void) | null = null;
		onclose: ((event: CloseEvent) => void) | null = null;
		onerror: ((event: Event) => void) | null = null;
		model = {
			provider: 'test',
			id: 'test-model',
			name: 'Test Model',
			thinkingLevelMap: { off: 'off', low: 'low', high: 'high' }
		};
		thinking = 'low';

		constructor() {
			super();
			queueMicrotask(() => {
				this.readyState = FakeWebSocket.OPEN;
				this.onopen?.(new Event('open'));
			});
		}

		send(raw: string) {
			const frame = JSON.parse(raw);
			if (frame.kind !== 'command') return;
			const respond = (data?: unknown) =>
				this.emit({
					kind: 'response',
					id: frame.id,
					command: frame.command,
					success: true,
					...(data === undefined ? {} : { data })
				});
			const state = () => ({
				cwd: '/workspaces/demo-project',
				projectName: 'demo-project',
				model: this.model,
				thinkingLevel: this.thinking,
				isStreaming: false,
				sessionFile: '/sessions/active.jsonl',
				sessionName: 'Active session'
			});
			switch (frame.command) {
				case 'get_state':
					this.emit({ kind: 'snapshot', snapshotType: 'state', data: state() });
					respond(state());
					break;
				case 'get_messages':
					this.emit({ kind: 'snapshot', snapshotType: 'messages', data: { messages: [] } });
					respond({ messages: [] });
					break;
				case 'get_commands':
					this.emit({
						kind: 'snapshot',
						snapshotType: 'commands',
						data: {
							commands: [{ name: 'review', description: 'Review changes', source: 'extension' }]
						}
					});
					respond({});
					break;
				case 'get_session_stats':
					this.emit({
						kind: 'snapshot',
						snapshotType: 'footer_stats',
						data: { tokens: { input: 12, output: 5, cacheRead: 0, cacheWrite: 0 }, cost: 0.01 }
					});
					respond({});
					break;
				case 'get_session_list':
					this.emit({
						kind: 'snapshot',
						snapshotType: 'session_list',
						data: {
							sessions: [
								{
									path: '/sessions/active.jsonl',
									id: 'active',
									name: 'Active session',
									modified: '2025-01-01T00:00:00.000Z',
									messageCount: 2,
									firstMessage: 'Hello'
								}
							]
						}
					});
					respond({});
					break;
				case 'get_available_models':
					this.emit({
						kind: 'snapshot',
						snapshotType: 'models',
						data: { models: [this.model, { provider: 'test', id: 'other', name: 'Other Model' }] }
					});
					respond({});
					break;
				case 'set_model':
					this.model = {
						...this.model,
						id: frame.params.modelId,
						name: frame.params.modelId === 'other' ? 'Other Model' : 'Test Model'
					};
					respond(this.model);
					break;
				case 'set_thinking_level':
					this.thinking = frame.params.level;
					respond();
					break;
				case 'get_tree':
					this.emit({
						kind: 'snapshot',
						snapshotType: 'tree',
						data: {
							leafId: 'user-1',
							tree: [
								{
									entry: {
										id: 'user-1',
										type: 'message',
										timestamp: 1,
										message: { role: 'user', content: 'Investigate this' }
									},
									children: []
								}
							]
						}
					});
					respond({});
					break;
				case 'prompt': {
					respond();
					this.emit({ kind: 'event', event: { type: 'agent_start' } });
					this.emit({
						kind: 'event',
						event: {
							type: 'message_start',
							message: { role: 'user', timestamp: 1, content: frame.params.message }
						}
					});
					this.emit({
						kind: 'event',
						event: {
							type: 'message_start',
							message: { role: 'assistant', timestamp: 2, content: [] }
						}
					});
					this.emit({
						kind: 'event',
						event: {
							type: 'message_update',
							message: {
								role: 'assistant',
								timestamp: 2,
								content: [{ type: 'text', text: 'Streaming answer' }]
							},
							assistantMessageEvent: { type: 'text_delta', contentIndex: 0 }
						}
					});
					this.emit({
						kind: 'event',
						event: {
							type: 'tool_execution_start',
							toolCallId: 'edit-1',
							toolName: 'edit',
							args: { path: 'src/app.ts' }
						}
					});
					this.emit({
						kind: 'event',
						event: {
							type: 'tool_execution_end',
							toolCallId: 'edit-1',
							toolName: 'edit',
							isError: false,
							result: {
								content: [{ type: 'text', text: 'Changed file' }],
								details: { diff: '+new\n-old' }
							}
						}
					});
					setTimeout(() => {
						this.emit({
							kind: 'event',
							event: {
								type: 'message_end',
								message: {
									role: 'assistant',
									timestamp: 2,
									content: [{ type: 'text', text: 'Streaming answer complete' }]
								}
							}
						});
						this.emit({ kind: 'event', event: { type: 'agent_settled' } });
					}, 250);
					break;
				}
				default:
					respond();
			}
		}

		close() {
			this.readyState = FakeWebSocket.CLOSED;
			this.onclose?.(new CloseEvent('close'));
		}
		emit(data: unknown) {
			this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
		}
	}
	Object.defineProperty(window, 'WebSocket', { value: FakeWebSocket, configurable: true });
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(fakeSocket);
});

test('streams a prompt, exposes tool output, and sends steering/follow-up commands', async ({
	page
}) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Web Agent — demo-project');
	await expect(page.getByText('/workspaces/demo-project')).toBeVisible();
	const editor = page.getByLabel('Message Pi');
	await expect(editor).toBeEnabled();
	await editor.fill('Inspect the app');
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByText('Streaming answer')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Steer' })).toBeVisible();
	await editor.fill('Focus on tests');
	await page.getByRole('button', { name: 'Steer' }).click();
	await editor.fill('Summarize afterwards');
	await page.getByRole('button', { name: 'Follow-up' }).click();
	await expect(page.getByText('Streaming answer complete')).toBeVisible();
	await page.getByRole('button', { name: 'Expand tools' }).click();
	await expect(page.getByText('Changed file')).toBeVisible();
	await expect(page.getByText('+new')).toBeVisible();
});

test('opens model, thinking, session, and mobile session controls', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Model' }).click();
	await expect(page.getByRole('dialog', { name: 'Model selection' })).toBeVisible();
	await page.getByRole('button', { name: 'Other Model' }).click();
	await expect(page.getByText('model Other Model')).toBeVisible();
	await page.getByRole('button', { name: 'Think', exact: true }).click();
	await page.getByRole('button', { name: 'high', exact: true }).click();
	await expect(page.getByText('think high')).toBeVisible();
	await page.getByRole('button', { name: 'Sessions' }).click();
	await expect(page.getByRole('dialog', { name: 'Sessions' })).toBeVisible();

	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'Close' }).click();
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Sessions' }).last().click();
	await expect(page.getByRole('dialog', { name: 'Sessions' })).toBeVisible();
});
