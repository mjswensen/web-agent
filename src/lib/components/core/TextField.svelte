<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		value = $bindable(),
		class: className = '',
		...rest
	}: HTMLInputAttributes & { value?: string } = $props();
</script>

<input
	{...rest}
	bind:value
	class={`min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-700 ${className}`}
/>
