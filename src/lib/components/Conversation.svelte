<script lang="ts">
	import { onMount, tick } from 'svelte';
	import MessageCard from './MessageCard.svelte';
	import ToolCard from './ToolCard.svelte';
	import type { AppState } from '$lib/state/app-state.svelte';
	import { isConversationAtBottom, scrollConversationToBottom } from './conversation-scroll.js';
	let { state: app }: { state: AppState } = $props();
	let scroller: HTMLElement;
	let content: HTMLElement;
	let showScrollButton = $state(false);
	let wasFollowing = true;

	function toolsFor(messageId: string) {
		return app.conversation.tools.filter((tool) => tool.parentMessageId === messageId);
	}

	function isAtBottom(): boolean {
		if (!scroller) return true;
		return isConversationAtBottom(scroller);
	}

	function updateScrollState(): void {
		if (!scroller) return;
		wasFollowing = isAtBottom();
		showScrollButton = scroller.scrollHeight > scroller.clientHeight && !wasFollowing;
	}

	function scrollToBottom(): void {
		if (!scroller) return;
		scrollConversationToBottom(scroller);
		wasFollowing = true;
		showScrollButton = false;
	}

	let blockSignature = $derived(
		`${app.conversation.messages.map((message) => `${message.id}:${message.text.length}:${message.thinking.length}`).join('|')}::${app.conversation.tools.map((tool) => `${tool.id}:${tool.output.length}:${tool.status}`).join('|')}`
	);

	$effect.pre(() => {
		void blockSignature;
		const shouldFollow = scroller ? isAtBottom() : true;
		void tick().then(() => {
			if (!scroller) return;
			if (shouldFollow) {
				scrollConversationToBottom(scroller);
				wasFollowing = true;
			}
			updateScrollState();
		});
	});

	onMount(() => {
		const resize = () => {
			if (wasFollowing) scroller.scrollTo({ top: scroller.scrollHeight });
			updateScrollState();
		};
		const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
		observer?.observe(scroller);
		observer?.observe(content);
		window.addEventListener('resize', resize);
		updateScrollState();
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', resize);
		};
	});
</script>

<div class="relative min-h-0 flex-1">
	<section
		bind:this={scroller}
		onscroll={updateScrollState}
		class="h-full overflow-y-auto px-4 py-5 sm:px-6"
		aria-label="Conversation"
		aria-live="polite"
	>
		<div bind:this={content} class="mx-auto flex w-full max-w-4xl flex-col gap-4">
			{#if app.conversation.messages.length === 0}
				<div
					class="grid min-h-52 place-items-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
				>
					<div>
						<p
							class="text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase dark:text-blue-300"
						>
							Ready
						</p>
						<h1 class="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
							Start a focused Pi session
						</h1>
						<p class="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
							Send a task below. Pi will stream its work here while the editor stays ready for your
							next instruction.
						</p>
					</div>
				</div>
			{:else}
				{#each app.conversation.messages as message (message.id)}
					<MessageCard {message} tools={toolsFor(message.id)} />
				{/each}
				{#each app.conversation.tools.filter((tool) => !tool.parentMessageId) as tool (tool.id)}
					<ToolCard {tool} />
				{/each}
			{/if}

			{#if app.conversation.lastError}
				<p
					class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
				>
					{app.conversation.lastError}
				</p>
			{/if}
		</div>
	</section>
	{#if showScrollButton}
		<button
			type="button"
			aria-label="Scroll to bottom"
			class="absolute right-4 bottom-3 z-10 min-h-11 min-w-11 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none sm:right-6 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-offset-slate-950"
			onclick={() => void scrollToBottom()}
		>
			<span aria-hidden="true">↓</span> <span class="sr-only sm:not-sr-only">Latest</span>
		</button>
	{/if}
</div>
