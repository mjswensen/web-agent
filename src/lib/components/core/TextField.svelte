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
	{value}
	class={`min-h-11 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none ${className}`}
/>
