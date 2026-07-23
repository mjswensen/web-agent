<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';

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
	<div
		class="fixed inset-0 z-30 grid place-items-end bg-slate-950/30 p-3 sm:place-items-center"
		role="presentation"
	>
		<div
			class="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Thinking level"
		>
			<header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<div>
					<h2 class="text-base font-semibold text-slate-900">Thinking level</h2>
					<p class="mt-1 text-xs text-slate-500">
						Pi may reject levels unsupported by the active model.
					</p>
				</div>
				<button
					type="button"
					class="min-h-9 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
					onclick={() => (app.layout.thinkingDialogOpen = false)}>Close</button
				>
			</header>
			<div class="grid gap-1 p-3">
				{#each levels as level (level)}<button
						type="button"
						class={`min-h-11 rounded-lg px-3 text-left text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${app.footer.thinking === level ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-800 hover:bg-slate-100'}`}
						onclick={() => void choose(level)}
						disabled={selecting !== undefined}>{selecting === level ? 'Applying…' : level}</button
					>{/each}
			</div>
		</div>
	</div>
{/if}
