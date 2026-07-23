<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';
	import SessionTreeNode from './SessionTreeNode.svelte';

	let {
		node,
		depth,
		app,
		client
	}: {
		node: Record<string, unknown>;
		depth: number;
		app: AppState;
		client: WebAgentWebSocketClient | undefined;
	} = $props();
	let expanded = $state(false);
	let entry = $derived(
		node.entry && typeof node.entry === 'object' && !Array.isArray(node.entry)
			? (node.entry as Record<string, unknown>)
			: {}
	);
	let children = $derived(
		Array.isArray(node.children)
			? node.children.filter(
					(child): child is Record<string, unknown> =>
						typeof child === 'object' && child !== null && !Array.isArray(child)
				)
			: []
	);
	let isForkable = $derived(
		entry.type === 'message' &&
			entry.message &&
			typeof entry.message === 'object' &&
			!Array.isArray(entry.message) &&
			(entry.message as Record<string, unknown>).role === 'user'
	);
	let summary = $derived(
		typeof entry.message === 'object' && entry.message !== null && !Array.isArray(entry.message)
			? (() => {
					const message = entry.message as Record<string, unknown>;
					return typeof message.content === 'string' ? message.content : (entry.type as string);
				})()
			: typeof entry.type === 'string'
				? entry.type
				: 'entry'
	);
	let label = $derived(typeof node.label === 'string' ? node.label : undefined);
	let timestamp = $derived(
		typeof entry.timestamp === 'number' || typeof entry.timestamp === 'string'
			? new Date(entry.timestamp).toLocaleString()
			: undefined
	);

	async function fork(): Promise<void> {
		if (!client || typeof entry.id !== 'string') return;
		try {
			const response = await client.sendCommand('fork', { entryId: entry.id });
			if (!response.success)
				app.addToast(response.error ?? 'Unable to fork from this message.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}
</script>

<div class="border-l border-slate-200 pl-3" style={`margin-left: ${depth * 12}px`}>
	<div
		class={`flex min-h-9 items-center gap-2 rounded px-2 text-xs ${entry.id === app.activeTreeLeafId ? 'bg-blue-50 text-blue-900' : 'text-slate-700'}`}
	>
		{#if children.length > 0}<button
				type="button"
				class="min-h-8 min-w-8 rounded hover:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				onclick={() => (expanded = !expanded)}
				aria-expanded={expanded}>{expanded ? '−' : '+'}</button
			>{:else}<span class="inline-block w-8 text-center text-slate-400">·</span>{/if}
		<span class="min-w-0 flex-1 truncate" title={summary}>{summary}</span>
		<span class="hidden shrink-0 text-[10px] text-slate-500 sm:inline"
			>{typeof entry.type === 'string' ? entry.type : 'entry'}{label ? ` · ${label}` : ''}{timestamp
				? ` · ${timestamp}`
				: ''}</span
		>
		{#if isForkable}<button
				type="button"
				class="min-h-8 rounded px-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				onclick={() => void fork()}>Fork</button
			>{/if}
	</div>
	{#if expanded}{#each children as child (typeof child.entry === 'object' && child.entry !== null && !Array.isArray(child.entry) && typeof (child.entry as Record<string, unknown>).id === 'string' ? (child.entry as Record<string, unknown>).id : JSON.stringify(child))}<SessionTreeNode
				node={child}
				depth={depth + 1}
				{app}
				{client}
			/>{/each}{/if}
</div>
