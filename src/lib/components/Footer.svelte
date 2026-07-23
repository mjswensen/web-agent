<script lang="ts">
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app }: { app: AppState } = $props();
</script>

<footer class="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 sm:px-6">
	<div class="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-x-4 gap-y-1">
		<span>{app.connection.statusMessage ?? 'Local Pi RPC connection'}</span>
		<div class="flex flex-wrap justify-end gap-x-3 gap-y-1">
			{#each Object.entries(app.extension.statuses) as [key, text] (key)}
				<span title={`Extension status: ${key}`}>{text}</span>
			{/each}
			<span title="Current model">model {app.footer.model}</span>
			<span title="Thinking level">think {app.footer.thinking}</span>
			<span title="Input and output tokens">{app.footer.tokens}</span>
			<span title="Total cost">{app.footer.cost}</span>
			<span title="Context usage">ctx {app.footer.context}</span>
		</div>
	</div>
</footer>
