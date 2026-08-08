<script lang="ts">
	let { thinking }: { thinking: string } = $props();
</script>

<section class="mt-4 border-l-2 border-violet-400 bg-violet-50/60 dark:bg-violet-950/25">
	<h3
		class="px-3 pt-3 text-[10px] font-bold tracking-[0.16em] text-violet-700 uppercase dark:text-violet-300"
	>
		Reasoning trace
	</h3>
	<pre
		class="m-0 px-3 py-3 text-xs leading-5 break-words whitespace-pre-wrap text-violet-950 dark:text-violet-100">{thinking}</pre>
</section>
