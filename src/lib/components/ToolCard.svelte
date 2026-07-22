<script lang="ts">
	import DiffView from './DiffView.svelte';
	import type { AppState } from '$lib/state/app-state.svelte';
	import type { ToolExecution } from '$lib/state/event-reducer';

	let { tool, app }: { tool: ToolExecution; app: AppState } = $props();

	let palette = $derived(
		tool.status === 'pending'
			? 'border-amber-200 bg-amber-50/70 text-amber-900'
			: tool.status === 'error'
				? 'border-red-200 bg-red-50/70 text-red-900'
				: 'border-green-200 bg-green-50/70 text-green-900'
	);
	let statusLabel = $derived(
		tool.status === 'pending' ? 'Running' : tool.status === 'error' ? 'Failed' : 'Done'
	);
	let hasDetail = $derived(Boolean(tool.args || tool.output || tool.diff));
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
		{#if hasDetail && tool.status !== 'pending'}
			<button
				type="button"
				class="min-h-9 shrink-0 rounded px-2 font-medium underline-offset-2 hover:underline focus:ring-2 focus:ring-current focus:outline-none"
				onclick={() => app.setToolsExpanded(!app.layout.toolsExpanded)}
				aria-expanded={app.layout.toolsExpanded}
			>
				{app.layout.toolsExpanded ? 'Collapse' : 'Expand'}
			</button>
		{/if}
	</header>

	{#if (app.layout.toolsExpanded || tool.status === 'pending') && hasDetail}
		<div class="border-t border-current/15 px-3 py-3">
			{#if tool.args}
				<p class="mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase opacity-70">
					Arguments
				</p>
				<pre
					class="m-0 max-h-48 overflow-auto rounded border border-slate-200 bg-white/70 px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-800">{tool.args}</pre>
			{/if}
			{#if tool.output}
				<p class="mt-3 mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase opacity-70">
					{tool.status === 'pending' ? 'Live output' : 'Output'}
				</p>
				<pre
					class="m-0 max-h-72 overflow-auto rounded border border-slate-200 bg-white/70 px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-800">{tool.output}</pre>
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
