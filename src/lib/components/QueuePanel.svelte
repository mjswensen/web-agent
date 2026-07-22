<script lang="ts">
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app }: { app: AppState } = $props();
	let count = $derived(app.queue.steering.length + app.queue.followUp.length);
</script>

{#if app.hasQueuedMessages}
	<section
		class="border-t border-slate-200 bg-amber-50 px-4 py-2 sm:px-6"
		aria-label="Queued messages"
	>
		<div class="mx-auto w-full max-w-4xl">
			<button
				type="button"
				class="min-h-11 rounded-md px-2 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline focus:ring-2 focus:ring-amber-500 focus:outline-none"
				onclick={() => app.toggleQueue()}
				aria-expanded={app.layout.queueOpen}
			>
				Queue · {count}
				{count === 1 ? 'message' : 'messages'} · {app.layout.queueOpen ? 'Hide' : 'Show'}
			</button>
			{#if app.layout.queueOpen}
				<div class="grid gap-3 pb-2 text-xs text-amber-950 sm:grid-cols-2">
					<section>
						<h2 class="font-semibold">Steering</h2>
						<p class="mt-1 text-amber-800">
							Delivered after the current assistant turn or tool calls.
						</p>
						{#each app.queue.steering as message, index (`steering:${index}:${message}`)}
							<pre
								class="font-inherit mt-2 rounded border border-amber-200 bg-white/70 px-2 py-2 break-words whitespace-pre-wrap">{message}</pre>
						{/each}
					</section>
					<section>
						<h2 class="font-semibold">Follow-up</h2>
						<p class="mt-1 text-amber-800">Delivered once the agent fully settles.</p>
						{#each app.queue.followUp as message, index (`follow-up:${index}:${message}`)}
							<pre
								class="font-inherit mt-2 rounded border border-amber-200 bg-white/70 px-2 py-2 break-words whitespace-pre-wrap">{message}</pre>
						{/each}
					</section>
				</div>
			{/if}
		</div>
	</section>
{/if}
