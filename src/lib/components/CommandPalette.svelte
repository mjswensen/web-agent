<script lang="ts">
	import { onMount } from 'svelte';
	import type { AppState } from '$lib/state/app-state.svelte';
	import Button from './core/Button.svelte';
	import DialogHeader from './core/DialogHeader.svelte';
	import DialogShell from './core/DialogShell.svelte';

	let { app }: { app: AppState } = $props();
	let viewportStyle = $state('');
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

	onMount(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const update = () => {
			viewportStyle = `top:${viewport.offsetTop}px;height:${viewport.height}px;bottom:auto;`;
		};
		update();
		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);
		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
		};
	});
</script>

{#if app.layout.commandPaletteOpen}
	<DialogShell kind="top" maxWidth="2xl" ariaLabel="Commands" style={viewportStyle}>
		<div class="flex max-h-[calc(100dvh-1.5rem)] flex-col" style="max-height: calc(100% - 1.5rem)">
			<DialogHeader
				title="Commands"
				titleSize="sm"
				description="Choose a command, prompt template, or skill to insert."
			>
				{#snippet actions()}
					<Button variant="muted" size="sm" onclick={() => (app.layout.commandPaletteOpen = false)}
						>Close</Button
					>
				{/snippet}
			</DialogHeader>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
				{#if matches.length === 0}
					<p class="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
						No matching command is available.
					</p>
				{:else}
					{#each matches as command (typeof command.name === 'string' ? command.name : JSON.stringify(command))}
						<button
							type="button"
							class="flex min-h-12 w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-slate-800"
							onclick={() => select(command)}
						>
							<span class="text-sm font-semibold text-slate-800 dark:text-slate-100"
								>/{typeof command.name === 'string' ? command.name : 'command'}</span
							>
							{#if typeof command.description === 'string'}<span
									class="mt-1 text-xs text-slate-500 dark:text-slate-400"
									>{command.description}</span
								>{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</DialogShell>
{/if}
