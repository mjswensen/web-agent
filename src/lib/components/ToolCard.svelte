<script lang="ts">
	import DiffView from './DiffView.svelte';
	import type { ToolExecution } from '../state/event-reducer';

	let { tool }: { tool: ToolExecution } = $props();

	let palette = $derived(
		tool.status === 'pending'
			? 'border-amber-300 [--tool-accent:var(--color-amber-500)] dark:border-amber-800'
			: tool.status === 'error'
				? 'border-red-300 [--tool-accent:var(--color-red-500)] dark:border-red-800'
				: 'border-emerald-300 [--tool-accent:var(--color-emerald-500)] dark:border-emerald-800'
	);
	let statusLabel = $derived(
		tool.status === 'pending' ? 'Running' : tool.status === 'error' ? 'Failed' : 'Done'
	);
</script>

<article
	class={`mt-4 overflow-hidden border bg-slate-50 text-slate-900 shadow-[inset_3px_0_0_var(--tool-accent)] dark:bg-slate-950/70 dark:text-slate-100 ${palette}`}
	aria-label={`${tool.name} tool call`}
>
	<header class="flex min-h-11 items-center justify-between gap-3 px-4 text-xs">
		<div class="flex min-w-0 items-center gap-2.5">
			<span
				class={`size-2 shrink-0 bg-[var(--tool-accent)] ${tool.status === 'pending' ? 'animate-pulse' : ''}`}
			></span>
			<span
				class="text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400"
				>Tool</span
			>
			<strong class="truncate text-slate-900 dark:text-white">{tool.name}</strong>
		</div>
		<span
			class="shrink-0 text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400"
			>{statusLabel}</span
		>
	</header>

	{#if tool.args || tool.output || tool.diff}
		<div class="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
			{#if tool.args}
				<p class="mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase opacity-70">
					Arguments
				</p>
				<pre
					class="m-0 max-h-80 overflow-auto border border-slate-200 bg-white px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">{tool.args}</pre>
			{/if}
			{#if tool.output}
				<p class="mt-3 mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase opacity-70">
					{tool.status === 'pending' ? 'Live output' : 'Output'}
				</p>
				<pre
					class="m-0 max-h-96 overflow-auto border border-slate-200 bg-slate-950 px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-100 dark:border-slate-800">{tool.output}</pre>
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
