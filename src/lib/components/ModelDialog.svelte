<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';
	import Button from './core/Button.svelte';
	import DialogHeader from './core/DialogHeader.svelte';
	import DialogShell from './core/DialogShell.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();
	let selecting = $state<string | undefined>(undefined);
	let groups = $derived.by(() => {
		const grouped: Record<string, Record<string, unknown>[]> = {};
		for (const model of app.models) {
			const provider = typeof model.provider === 'string' ? model.provider : 'Other';
			(grouped[provider] ??= []).push(model);
		}
		return Object.entries(grouped);
	});

	async function refresh(): Promise<void> {
		try {
			const response = await client?.sendCommand('get_available_models');
			if (response && !response.success)
				app.addToast(response.error ?? 'Unable to load models.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	async function choose(model: Record<string, unknown>): Promise<void> {
		if (!client || typeof model.provider !== 'string' || typeof model.id !== 'string') return;
		const key = `${model.provider}/${model.id}`;
		selecting = key;
		try {
			const response = await client.sendCommand('set_model', {
				provider: model.provider,
				modelId: model.id
			});
			if (response.success) {
				app.layout.modelDialogOpen = false;
				await client.sendCommand('get_state');
			} else app.addToast(response.error ?? 'Pi rejected the model.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			selecting = undefined;
		}
	}
</script>

{#if app.layout.modelDialogOpen}
	<DialogShell maxWidth="2xl" ariaLabel="Model selection">
		<DialogHeader
			title="Select model"
			description="The active model changes for every connected tab."
		>
			{#snippet actions()}
				<Button
					variant="ghost"
					size="sm"
					class="font-semibold text-blue-700 hover:bg-blue-50"
					onclick={() => void refresh()}>Refresh</Button
				><Button variant="muted" size="sm" onclick={() => (app.layout.modelDialogOpen = false)}
					>Close</Button
				>
			{/snippet}
		</DialogHeader>
		<div class="max-h-[65vh] overflow-y-auto p-3">
			{#if groups.length === 0}<p class="px-2 py-8 text-center text-sm text-slate-500">
					No models loaded yet. Select Refresh to fetch them.
				</p>{/if}
			{#each groups as [provider, models] (provider)}
				<section class="mb-4">
					<h3 class="px-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
						{provider}
					</h3>
					<div class="mt-2 grid gap-1">
						{#each models as model (typeof model.id === 'string' ? model.id : JSON.stringify(model))}<button
								type="button"
								class="flex min-h-12 items-center justify-between rounded-lg px-3 text-left hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								onclick={() => void choose(model)}
								disabled={selecting !== undefined}
								><span class="text-sm font-medium text-slate-800"
									>{typeof model.name === 'string'
										? model.name
										: typeof model.id === 'string'
											? model.id
											: 'Model'}</span
								><span class="ml-4 text-xs text-slate-500"
									>{selecting === `${model.provider}/${model.id}` ? 'Selecting…' : model.id}</span
								></button
							>{/each}
					</div>
				</section>
			{/each}
		</div>
	</DialogShell>
{/if}
