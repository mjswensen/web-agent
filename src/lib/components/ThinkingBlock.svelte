<script lang="ts">
	import type { AppState } from '$lib/state/app-state.svelte';

	let { thinking, app }: { thinking: string; app: AppState } = $props();
</script>

<section class="mt-3 overflow-hidden rounded-md border border-violet-200 bg-violet-50/70">
	<button
		type="button"
		class="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-xs font-semibold text-violet-800 focus:ring-2 focus:ring-violet-500 focus:outline-none focus:ring-inset"
		onclick={() => app.setThinkingExpanded(!app.layout.thinkingExpanded)}
		aria-expanded={app.layout.thinkingExpanded}
	>
		<span>Thinking</span>
		<span class="font-normal text-violet-700">{app.layout.thinkingExpanded ? 'Hide' : 'Show'}</span>
	</button>
	{#if app.layout.thinkingExpanded}
		<pre
			class="m-0 border-t border-violet-200 px-3 py-3 text-xs leading-5 break-words whitespace-pre-wrap text-violet-950">{thinking}</pre>
	{/if}
</section>
