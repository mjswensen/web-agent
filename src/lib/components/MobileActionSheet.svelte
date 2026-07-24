<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();

	function open(
		target:
			| 'sessionDrawerOpen'
			| 'treeDrawerOpen'
			| 'modelDialogOpen'
			| 'thinkingDialogOpen'
			| 'compactDialogOpen'
			| 'commandPaletteOpen'
	): void {
		app.layout.mobileActionsOpen = false;
		app.layout[target] = true;
		if (target === 'sessionDrawerOpen') void client?.sendCommand('get_session_list');
		if (target === 'treeDrawerOpen') void client?.sendCommand('get_tree');
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
			class="absolute right-3 bottom-3 left-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
		>
			<div class="grid grid-cols-2 gap-2 text-sm">
				<button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => open('sessionDrawerOpen')}>Sessions</button
				><button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => open('treeDrawerOpen')}>Tree</button
				><button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => open('modelDialogOpen')}>Model</button
				><button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => open('thinkingDialogOpen')}>Thinking</button
				><button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => open('compactDialogOpen')}>Compact</button
				><button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => open('commandPaletteOpen')}>Commands</button
				>
			</div>
		</div>
	</div>
{/if}
