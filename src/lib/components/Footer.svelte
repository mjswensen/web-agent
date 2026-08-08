<script lang="ts">
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app }: { app: AppState } = $props();

	function thinkingClass(level: string): string {
		switch (level.toLowerCase()) {
			case 'off':
				return 'text-slate-500 dark:text-slate-400';
			case 'minimal':
				return 'text-slate-600 dark:text-slate-300';
			case 'low':
				return 'text-slate-700 dark:text-slate-200';
			case 'medium':
				return 'text-blue-600 dark:text-blue-400';
			case 'high':
				return 'text-purple-600 dark:text-purple-400';
			case 'xhigh':
				return 'text-purple-700 dark:text-purple-300';
			case 'max':
				return 'text-pink-600 dark:text-pink-400';
			default:
				return 'text-slate-700 dark:text-slate-200';
		}
	}

	function contextClass(percent: number | undefined): string {
		if (percent === undefined) return 'text-slate-700 dark:text-slate-200';
		if (percent <= 40) return 'text-green-600 dark:text-green-400';
		if (percent <= 60) return 'text-yellow-600 dark:text-yellow-400';
		if (percent <= 80) return 'text-orange-600 dark:text-orange-400';
		return 'text-red-600 dark:text-red-400';
	}
</script>

<footer
	class="border-t border-slate-300 bg-slate-200/80 px-4 py-1.5 text-[10px] text-slate-600 sm:px-6 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
>
	<div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
		<span class="truncate tracking-wide">{app.connection.statusMessage ?? 'LOCAL PI RPC'}</span>
		<div class="flex flex-wrap justify-end gap-x-3 gap-y-1 font-medium">
			{#each Object.entries(app.extension.statuses) as [key, text] (key)}
				<span title={`Extension status: ${key}`}>{text}</span>
			{/each}
			<span title="Current model"
				>model <strong class="text-slate-700 dark:text-slate-200">{app.footer.model}</strong></span
			>
			<span title="Thinking level"
				>think <strong class={thinkingClass(app.footer.thinking)}>{app.footer.thinking}</strong
				></span
			>
			<span title="Input and output tokens">{app.footer.tokens}</span>
			<span title="Total cost">{app.footer.cost}</span>
			<span title="Context usage"
				>ctx <strong class={contextClass(app.footer.context.percent)}
					>{app.footer.context.percentage}</strong
				>{app.footer.context.details}</span
			>
		</div>
	</div>
</footer>
