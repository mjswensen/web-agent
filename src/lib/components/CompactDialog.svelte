<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();
	let instructions = $state('');
	let compacting = $state(false);

	async function compact(): Promise<void> {
		if (!client) return;
		compacting = true;
		try {
			const response = await client.sendCommand(
				'compact',
				instructions.trim() ? { customInstructions: instructions } : {}
			);
			if (response.success) {
				app.layout.compactDialogOpen = false;
				instructions = '';
			} else app.addToast(response.error ?? 'Pi could not compact the session.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			compacting = false;
		}
	}
</script>

{#if app.layout.compactDialogOpen}
	<div
		class="fixed inset-0 z-30 grid place-items-end bg-slate-950/30 p-3 sm:place-items-center"
		role="presentation"
	>
		<div
			class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Compact conversation"
		>
			<h2 class="text-base font-semibold text-slate-900">Compact conversation</h2>
			<p class="mt-2 text-sm leading-6 text-slate-600">
				Pi will summarize prior context to make room for the next part of the session.
			</p>
			<label class="mt-4 block text-sm font-medium text-slate-700" for="compact-instructions"
				>Optional instructions</label
			>
			<textarea
				id="compact-instructions"
				bind:value={instructions}
				rows="4"
				placeholder="What should Pi preserve in the summary?"
				class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
			></textarea>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
					onclick={() => (app.layout.compactDialogOpen = false)}>Cancel</button
				><button
					type="button"
					class="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:bg-slate-300"
					onclick={() => void compact()}
					disabled={compacting}>{compacting ? 'Compacting…' : 'Compact'}</button
				>
			</div>
			{#if app.compaction.message}<p class="mt-3 text-xs text-slate-500">
					{app.compaction.message}
				</p>{/if}
		</div>
	</div>
{/if}
