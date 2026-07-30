<script lang="ts">
	import DiffView from './DiffView.svelte';
	import type { ToolExecution } from '$lib/state/event-reducer';

	let { tool }: { tool: ToolExecution } = $props();

	let palette = $derived(
		tool.status === 'pending'
			? 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
			: tool.status === 'error'
				? 'border-red-200 bg-red-50/70 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200'
				: 'border-green-200 bg-green-50/70 text-green-900 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200'
	);
	let statusLabel = $derived(
		tool.status === 'pending' ? 'Running' : tool.status === 'error' ? 'Failed' : 'Done'
	);
</script>

<article
	class={`mt-3 overflow-hidden rounded-md border ${palette}`}
	aria-label={`${tool.name} tool call`}
>
	<header class="flex min-h-11 items-center justify-between gap-3 px-3 text-xs">
		<div class="flex min-w-0 items-center gap-2">
			{#if tool.status === 'pending'}
				<span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500"></span>
			{/if}
			<strong class="truncate">{tool.name}</strong>
			<span class="shrink-0 opacity-75">{statusLabel}</span>
		</div>
	</header>

	{#if tool.args || tool.output || tool.diff}
		<div class="border-t border-current/15 px-3 py-3">
			{#if tool.args}
				<p class="mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase opacity-70">
					Arguments
				</p>
				<pre
					class="m-0 overflow-auto rounded border border-slate-200 bg-white/70 px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-800 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100">{tool.args}</pre>
			{/if}
			{#if tool.output}
				<p class="mt-3 mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase opacity-70">
					{tool.status === 'pending' ? 'Live output' : 'Output'}
				</p>
				<pre
					class="m-0 overflow-auto rounded border border-slate-200 bg-white/70 px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-800 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100">{tool.output}</pre>
			{/if}
			{#if tool.diff}
				<p class="mt-3 mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase opacity-70">
					Diff
				</p>
				<DiffView diff={tool.diff} />
			{/if}
		</div>
	{/if}
</article>
