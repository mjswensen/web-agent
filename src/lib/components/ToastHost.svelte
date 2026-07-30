<script lang="ts">
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app }: { app: AppState } = $props();

	function palette(type: 'info' | 'warning' | 'error'): string {
		return type === 'error'
			? 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
			: type === 'warning'
				? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
				: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100';
	}
</script>

<div
	class="pointer-events-none fixed right-3 bottom-3 z-50 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2"
	aria-live="polite"
>
	{#each app.extension.toasts as toast (toast.id)}
		<div
			class={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg border px-3 py-3 text-sm shadow-lg ${palette(toast.type)}`}
			role="status"
		>
			<p class="min-w-0 break-words">{toast.message}</p>
			<button
				type="button"
				class="min-h-8 shrink-0 rounded px-1 text-xs font-semibold hover:underline focus:ring-2 focus:ring-current focus:outline-none"
				onclick={() => app.dismissToast(toast.id)}>Close</button
			>
		</div>
	{/each}
</div>
