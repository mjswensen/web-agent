<script lang="ts">
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app }: { app: AppState } = $props();
	let query = $derived(app.editorText.startsWith('/') ? app.editorText.slice(1).toLowerCase() : '');
	let matches = $derived(
		app.commands.filter((command) => {
			const name = typeof command.name === 'string' ? command.name : '';
			const description = typeof command.description === 'string' ? command.description : '';
			return `${name} ${description}`.toLowerCase().includes(query);
		})
	);

	function select(command: Record<string, unknown>): void {
		if (typeof command.name !== 'string') return;
		app.editorText = `/${command.name} `;
		app.layout.commandPaletteOpen = false;
	}
</script>

{#if app.layout.commandPaletteOpen}
	<div
		class="fixed inset-0 z-30 bg-slate-950/20 p-3 sm:grid sm:place-items-start sm:pt-20"
		role="presentation"
	>
		<div
			class="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Commands"
		>
			<header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<div>
					<h2 class="text-sm font-semibold text-slate-900">Commands</h2>
					<p class="mt-1 text-xs text-slate-500">
						Choose a command, prompt template, or skill to insert.
					</p>
				</div>
				<button
					type="button"
					class="min-h-9 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
					onclick={() => (app.layout.commandPaletteOpen = false)}>Close</button
				>
			</header>
			<div class="max-h-[60vh] overflow-y-auto p-2">
				{#if matches.length === 0}
					<p class="px-3 py-6 text-center text-sm text-slate-500">
						No matching command is available.
					</p>
				{:else}
					{#each matches as command (typeof command.name === 'string' ? command.name : JSON.stringify(command))}
						<button
							type="button"
							class="flex min-h-12 w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							onclick={() => select(command)}
						>
							<span class="text-sm font-semibold text-slate-800"
								>/{typeof command.name === 'string' ? command.name : 'command'}</span
							>
							{#if typeof command.description === 'string'}<span class="mt-1 text-xs text-slate-500"
									>{command.description}</span
								>{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}
