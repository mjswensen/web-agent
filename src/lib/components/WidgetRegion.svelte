<script lang="ts">
	import type { ExtensionWidget } from '../state/app-state.svelte';

	let { widgets }: { widgets: ExtensionWidget[] } = $props();
</script>

{#if widgets.length > 0}
	<section
		class="border-t border-slate-200 bg-slate-50 px-4 py-2 sm:px-6 dark:border-slate-700 dark:bg-slate-950"
		aria-label="Extension widgets"
	>
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-2">
			{#each widgets as widget (widget.key)}
				<pre
					class="m-0 rounded border border-slate-200 bg-white px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{widget.lines.join(
						'\n'
					)}</pre>
			{/each}
		</div>
	</section>
{/if}
