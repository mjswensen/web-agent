<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';

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
	<div
		class="fixed inset-0 z-30 grid place-items-end bg-slate-950/30 p-3 sm:place-items-center"
		role="presentation"
	>
		<div
			class="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Model selection"
		>
			<header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<div>
					<h2 class="text-base font-semibold text-slate-900">Select model</h2>
					<p class="mt-1 text-xs text-slate-500">
						The active model changes for every connected tab.
					</p>
				</div>
				<div class="flex gap-1">
					<button
						type="button"
						class="min-h-9 rounded px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						onclick={() => void refresh()}>Refresh</button
					><button
						type="button"
						class="min-h-9 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
						onclick={() => (app.layout.modelDialogOpen = false)}>Close</button
					>
				</div>
			</header>
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
		</div>
	</div>
{/if}
