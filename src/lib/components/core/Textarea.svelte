<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		value = $bindable(),
		class: className = '',
		...rest
	}: HTMLTextareaAttributes & { value?: string } = $props();
</script>

<textarea
	{...rest}
	bind:value
	class={`rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none ${className}`}
></textarea>
