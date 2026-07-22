<script lang="ts">
	import type { AppState } from '$lib/state/app-state.svelte';
	import type { ConversationMessage, ToolExecution } from '$lib/state/event-reducer';
	import ThinkingBlock from './ThinkingBlock.svelte';
	import ToolCard from './ToolCard.svelte';

	let {
		message,
		tools,
		app
	}: { message: ConversationMessage; tools: ToolExecution[]; app: AppState } = $props();

	const labelByRole = {
		user: 'You',
		assistant: 'Pi',
		tool: 'Tool',
		system: 'System'
	} as const;

	let cardClass = $derived(
		message.role === 'user'
			? 'border-blue-200 bg-blue-50/70'
			: message.role === 'assistant'
				? 'border-slate-200 bg-white'
				: message.role === 'tool'
					? 'border-amber-200 bg-amber-50/70'
					: 'border-slate-200 bg-slate-50'
	);
</script>

<article
	class={`rounded-lg border px-4 py-3 shadow-sm ${cardClass}`}
	aria-label={`${labelByRole[message.role]} message`}
>
	<header
		class="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase"
	>
		<span>{labelByRole[message.role]}</span>
		{#if message.isStreaming}
			<span class="flex items-center gap-1 tracking-normal text-blue-600 normal-case">
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></span> streaming
			</span>
		{/if}
	</header>

	{#if message.text}
		<pre
			class="font-inherit m-0 text-sm leading-6 break-words whitespace-pre-wrap text-slate-800">{message.text}</pre>
	{/if}
	{#if message.thinking}
		<ThinkingBlock thinking={message.thinking} {app} />
	{/if}
	{#if message.error}
		<p class="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
			{message.error}
		</p>
	{/if}
	{#each tools as tool (tool.id)}
		<ToolCard {tool} {app} />
	{/each}
</article>
