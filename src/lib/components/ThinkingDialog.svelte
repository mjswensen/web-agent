<script lang="ts">
	import type { WebAgentWebSocketClient } from '../client/ws-client';
	import type { AppState } from '../state/app-state.svelte';
	import Button from './core/Button.svelte';
	import DialogHeader from './core/DialogHeader.svelte';
	import DialogShell from './core/DialogShell.svelte';

	const defaultLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();
	let selecting = $state<string | undefined>(undefined);
	let levels = $derived.by(() => {
		const model = app.sessionState?.model;
		const map =
			model && typeof model === 'object' && !Array.isArray(model)
				? model.thinkingLevelMap
				: undefined;
		if (!map || typeof map !== 'object' || Array.isArray(map)) return defaultLevels;
		const supported = defaultLevels.filter((level) => map[level] !== null);
		return supported.length > 0 ? supported : defaultLevels;
	});

	async function choose(level: string): Promise<void> {
		if (!client) return;
		selecting = level;
		try {
			const response = await client.sendCommand('set_thinking_level', { level });
			if (response.success) {
				app.layout.thinkingDialogOpen = false;
				await client.sendCommand('get_state');
			} else app.addToast(response.error ?? 'Pi rejected that thinking level.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			selecting = undefined;
		}
	}
</script>

{#if app.layout.thinkingDialogOpen}
	<DialogShell maxWidth="md" ariaLabel="Thinking level">
		<DialogHeader
			title="Thinking level"
			description="Pi may reject levels unsupported by the active model."
		>
			{#snippet actions()}
				<Button variant="muted" size="sm" onclick={() => (app.layout.thinkingDialogOpen = false)}
					>Close</Button
				>
			{/snippet}
		</DialogHeader>
		<div class="grid gap-1 p-3">
			{#each levels as level (level)}<button
					type="button"
					class={`min-h-11 rounded-lg px-3 text-left text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${app.footer.thinking === level ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-800 hover:bg-slate-100'}`}
					onclick={() => void choose(level)}
					disabled={selecting !== undefined}>{selecting === level ? 'Applying…' : level}</button
				>{/each}
		</div>
	</DialogShell>
{/if}
