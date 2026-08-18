<script lang="ts">
	import type { ConversationMessage, ToolExecution } from '../state/event-reducer';
	import Markdown from './Markdown.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';
	import ToolCard from './ToolCard.svelte';

	let { message, tools }: { message: ConversationMessage; tools: ToolExecution[] } = $props();

	const labelByRole = {
		user: 'You',
		assistant: 'Pi',
		tool: 'Tool',
		system: 'System'
	} as const;

	let cardClass = $derived(
		message.role === 'user'
			? 'ml-auto w-[min(88%,48rem)] border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/45'
			: message.role === 'assistant'
				? 'mr-auto w-full border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
				: message.role === 'tool'
					? 'w-full border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
					: 'w-full border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
	);
</script>

<article
	class={`relative border px-4 py-4 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:px-5 ${cardClass}`}
	aria-label={`${labelByRole[message.role]} message`}
>
	<span
		class={`absolute top-0 bottom-0 left-0 w-1 ${message.role === 'user' ? 'bg-blue-500' : message.role === 'assistant' ? 'bg-slate-800 dark:bg-slate-300' : message.role === 'tool' ? 'bg-amber-500' : 'bg-slate-400'}`}
		aria-hidden="true"
	></span>
	<header
		class="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400"
	>
		<span>{labelByRole[message.role]}</span>
		<span class="h-px w-5 bg-slate-300 dark:bg-slate-700" aria-hidden="true"></span>
		{#if message.isStreaming}
			<span
				class="flex items-center gap-1.5 tracking-normal text-blue-700 normal-case dark:text-blue-300"
			>
				<span class="size-1.5 animate-pulse bg-blue-500"></span> responding
			</span>
		{/if}
	</header>

	{#if message.text}
		{#if message.role === 'user' || message.role === 'assistant'}
			<Markdown source={message.text} />
		{:else}
			<pre
				class="font-inherit m-0 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-slate-800 dark:text-slate-100">{message.text}</pre>
		{/if}
	{/if}
	{#if message.thinking}
		<ThinkingBlock thinking={message.thinking} />
	{/if}
	{#if message.error}
		<p class="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
			{message.error}
		</p>
	{/if}
	{#each tools as tool (tool.id)}
		<ToolCard {tool} />
	{/each}
</article>
