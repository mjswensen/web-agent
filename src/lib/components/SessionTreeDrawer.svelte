<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';
	import SessionTreeNode from './SessionTreeNode.svelte';
	import Button from './core/Button.svelte';
	import DialogHeader from './core/DialogHeader.svelte';
	import DialogShell from './core/DialogShell.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();

	async function clone(): Promise<void> {
		if (!client) return;
		try {
			const response = await client.sendCommand('clone');
			if (!response.success)
				app.addToast(response.error ?? 'Unable to clone the active branch.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}
</script>

{#if app.layout.treeDrawerOpen}
	<DialogShell kind="drawer" maxWidth="xl" ariaLabel="Session tree">
		<DialogHeader
			title="Session tree"
			description="Browse branches. Continue-in-place is not available over Pi RPC."
		>
			{#snippet actions()}
				<Button variant="muted" size="sm" onclick={() => (app.layout.treeDrawerOpen = false)}
					>Close</Button
				>
			{/snippet}
		</DialogHeader>
		<div class="border-b border-slate-200 p-3">
			<Button variant="secondary" size="touch" onclick={() => void clone()}
				>Clone active branch</Button
			>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto p-3">
			{#if app.tree.length === 0}<p class="px-2 py-8 text-center text-sm text-slate-500">
					No tree data loaded yet.
				</p>{/if}{#each app.tree as node (typeof node.entry === 'object' && node.entry !== null && !Array.isArray(node.entry) && typeof (node.entry as Record<string, unknown>).id === 'string' ? (node.entry as Record<string, unknown>).id : JSON.stringify(node))}<SessionTreeNode
					{node}
					depth={0}
					{app}
					{client}
				/>{/each}
		</div>
	</DialogShell>
{/if}
