import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MessageCard from './MessageCard.svelte';

describe('MessageCard.svelte', () => {
	it('renders user and assistant text as Markdown', async () => {
		render(MessageCard, {
			message: {
				id: 'user-1',
				role: 'user',
				text: '# Task\n\n**Review** the [docs](/docs).',
				thinking: '',
				isStreaming: false
			},
			tools: []
		});
		render(MessageCard, {
			message: {
				id: 'assistant-1',
				role: 'assistant',
				text: 'Use `npm test` and ~~skip~~ nothing.',
				thinking: '',
				isStreaming: false
			},
			tools: []
		});

		await expect.element(page.getByRole('heading', { name: 'Task' })).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'docs' })).toHaveAttribute('href', '/docs');
		const inlineCode = page.getByText('npm test', { exact: true }).element();
		const deleted = page.getByText('skip', { exact: true }).element();
		expect(inlineCode.tagName).toBe('CODE');
		expect(deleted.tagName).toBe('S');
	});

	it('keeps thinking, tool output, diffs, and errors as literal text', async () => {
		render(MessageCard, {
			message: {
				id: 'assistant-2',
				role: 'assistant',
				text: '**Rendered**',
				thinking: '**literal thinking**',
				error: '**literal error**',
				isStreaming: false
			},
			tools: [
				{
					id: 'tool-1',
					name: 'edit',
					args: '**literal arguments**',
					output: '**literal output**',
					diff: '+**literal diff**',
					status: 'success'
				}
			]
		});

		const rendered = page.getByText('Rendered', { exact: true }).element();
		expect(rendered.tagName).toBe('STRONG');
		await expect.element(page.getByText('**literal thinking**', { exact: true })).toBeVisible();
		await expect.element(page.getByText('**literal arguments**', { exact: true })).toBeVisible();
		await expect.element(page.getByText('**literal output**', { exact: true })).toBeVisible();
		await expect.element(page.getByText('+**literal diff**', { exact: true })).toBeVisible();
		await expect.element(page.getByText('**literal error**', { exact: true })).toBeVisible();
	});
});
