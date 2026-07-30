<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		titleSize = 'base',
		actions
	}: {
		title: string;
		description?: string;
		titleSize?: 'base' | 'sm';
		actions?: Snippet;
	} = $props();
</script>

<header
	class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700"
>
	<div>
		<h2
			class={titleSize === 'sm'
				? 'text-sm font-semibold text-slate-900 dark:text-slate-100'
				: 'text-base font-semibold text-slate-900 dark:text-slate-100'}
		>
			{title}
		</h2>
		{#if description}<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
				{description}
			</p>{/if}
	</div>
	{#if actions}<div class="flex gap-1">{@render actions()}</div>{/if}
</header>
