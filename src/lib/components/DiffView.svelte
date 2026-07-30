<script lang="ts">
	let { diff }: { diff: string } = $props();

	function lineClass(line: string): string {
		if (line.startsWith('+') && !line.startsWith('+++'))
			return 'bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100';
		if (line.startsWith('-') && !line.startsWith('---'))
			return 'bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100';
		if (line.startsWith('@@'))
			return 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
		return 'text-slate-700 dark:text-slate-300';
	}
</script>

<pre
	class="mt-3 overflow-auto rounded border border-slate-200 bg-slate-50 py-2 text-xs leading-5 dark:border-slate-700 dark:bg-slate-950"><code
		>{#each diff.split('\n') as line, index (`${index}:${line}`)}<span
				class={`block min-w-max px-3 ${lineClass(line)}`}>{line || ' '}</span
			>{/each}</code
	></pre>
