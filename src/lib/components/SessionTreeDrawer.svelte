<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';
	import SessionTreeNode from './SessionTreeNode.svelte';

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
	<div class="fixed inset-0 z-30 bg-slate-950/30 p-3 sm:p-6" role="presentation">
		<div
			class="ml-auto flex h-full w-full max-w-xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Session tree"
		>
			<header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<div>
					<h2 class="text-base font-semibold text-slate-900">Session tree</h2>
					<p class="mt-1 text-xs text-slate-500">
						Browse branches. Continue-in-place is not available over Pi RPC.
					</p>
				</div>
				<button
					type="button"
					class="min-h-9 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
					onclick={() => (app.layout.treeDrawerOpen = false)}>Close</button
				>
			</header>
			<div class="border-b border-slate-200 p-3">
				<button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => void clone()}>Clone active branch</button
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
		</div>
	</div>
{/if}
