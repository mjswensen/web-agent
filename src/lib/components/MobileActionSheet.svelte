<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';
	import Button from './core/Button.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();

	function open(
		target:
			| 'sessionDrawerOpen'
			| 'treeDrawerOpen'
			| 'gitStatusDrawerOpen'
			| 'modelDialogOpen'
			| 'thinkingDialogOpen'
			| 'compactDialogOpen'
			| 'commandPaletteOpen'
	): void {
		app.layout.mobileActionsOpen = false;
		app.layout[target] = true;
		if (target === 'sessionDrawerOpen') void client?.sendCommand('get_session_list');
		if (target === 'treeDrawerOpen') void client?.sendCommand('get_tree');
		if (target === 'gitStatusDrawerOpen') void client?.sendCommand('get_git_status');
		if (target === 'modelDialogOpen') void client?.sendCommand('get_available_models');
	}
</script>

{#if app.layout.mobileActionsOpen}
	<div
		class="fixed inset-0 z-30 bg-slate-950/30 sm:hidden"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) app.layout.mobileActionsOpen = false;
		}}
	>
		<div
			class="absolute right-3 bottom-3 left-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
		>
			<div class="grid grid-cols-2 gap-2 text-sm">
				<Button
					variant="secondary"
					size="touch"
					class="text-slate-800"
					onclick={() => open('sessionDrawerOpen')}>Sessions</Button
				><Button
					variant="secondary"
					size="touch"
					class="text-slate-800"
					onclick={() => open('treeDrawerOpen')}>Tree</Button
				><Button
					variant="secondary"
					size="touch"
					class="text-slate-800"
					onclick={() => open('gitStatusDrawerOpen')}>Changes</Button
				><Button
					variant="secondary"
					size="touch"
					class="text-slate-800"
					onclick={() => open('modelDialogOpen')}>Model</Button
				><Button
					variant="secondary"
					size="touch"
					class="text-slate-800"
					onclick={() => open('thinkingDialogOpen')}>Thinking</Button
				><Button
					variant="secondary"
					size="touch"
					class="text-slate-800"
					onclick={() => open('compactDialogOpen')}>Compact</Button
				><Button
					variant="secondary"
					size="touch"
					class="text-slate-800"
					onclick={() => open('commandPaletteOpen')}>Commands</Button
				>
			</div>
		</div>
	</div>
{/if}
