<script lang="ts">
	let { thinking }: { thinking: string } = $props();
</script>

<section
	class="mt-3 overflow-hidden rounded-md border border-violet-200 bg-violet-50/70 dark:border-violet-800 dark:bg-violet-950/50"
>
	<h3
		class="border-b border-violet-200 px-3 py-3 text-xs font-semibold text-violet-800 dark:border-violet-800 dark:text-violet-300"
	>
		Thinking
	</h3>
	<pre
		class="m-0 px-3 py-3 text-xs leading-5 break-words whitespace-pre-wrap text-violet-950 dark:text-violet-100">{thinking}</pre>
</section>
