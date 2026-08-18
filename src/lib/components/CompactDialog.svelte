<script lang="ts">
	import type { WebAgentWebSocketClient } from '../client/ws-client';
	import type { AppState } from '../state/app-state.svelte';
	import Button from './core/Button.svelte';
	import DialogShell from './core/DialogShell.svelte';
	import Textarea from './core/Textarea.svelte';

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
	<DialogShell maxWidth="lg" ariaLabel="Compact conversation" class="p-5">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Compact conversation</h2>
		<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
			Pi will summarize prior context to make room for the next part of the session.
		</p>
		<label
			class="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200"
			for="compact-instructions">Optional instructions</label
		>
		<Textarea
			id="compact-instructions"
			bind:value={instructions}
			rows={4}
			placeholder="What should Pi preserve in the summary?"
			class="mt-2 w-full"
		/>
		<div class="mt-4 flex justify-end gap-2">
			<Button variant="muted" size="touch" onclick={() => (app.layout.compactDialogOpen = false)}
				>Cancel</Button
			><Button variant="primary" size="touch" onclick={() => void compact()} disabled={compacting}
				>{compacting ? 'Compacting…' : 'Compact'}</Button
			>
		</div>
		{#if app.compaction.message}<p class="mt-3 text-xs text-slate-500">
				{app.compaction.message}
			</p>{/if}
	</DialogShell>
{/if}
