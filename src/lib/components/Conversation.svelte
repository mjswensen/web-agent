<script lang="ts">
	import MessageCard from './MessageCard.svelte';
	import ToolCard from './ToolCard.svelte';
	import type { AppState } from '$lib/state/app-state.svelte';

	let { state }: { state: AppState } = $props();

	function toolsFor(messageId: string) {
		return state.conversation.tools.filter((tool) => tool.parentMessageId === messageId);
	}
</script>

<section
	class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
	aria-label="Conversation"
	aria-live="polite"
>
	<div class="mx-auto flex w-full max-w-4xl flex-col gap-4">
		{#if state.conversation.messages.length === 0}
			<div
				class="grid min-h-52 place-items-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 text-center shadow-sm"
			>
				<div>
					<p class="text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase">Ready</p>
					<h1 class="mt-2 text-lg font-semibold text-slate-800">Start a focused Pi session</h1>
					<p class="mt-2 max-w-md text-sm leading-6 text-slate-500">
						Send a task below. Pi will stream its work here while the editor stays ready for your
						next instruction.
					</p>
				</div>
			</div>
		{:else}
			{#each state.conversation.messages as message (message.id)}
				<MessageCard {message} tools={toolsFor(message.id)} app={state} />
			{/each}
			{#each state.conversation.tools.filter((tool) => !tool.parentMessageId) as tool (tool.id)}
				<ToolCard {tool} app={state} />
			{/each}
		{/if}

		{#if state.conversation.lastError}
			<p class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
				{state.conversation.lastError}
			</p>
		{/if}
	</div>
</section>
