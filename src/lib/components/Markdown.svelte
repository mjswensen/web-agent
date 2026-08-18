<script lang="ts">
	import { renderMarkdown } from '../format/markdown';

	let { source, compact = false }: { source: string; compact?: boolean } = $props();

	const render = (() => {
		let previousSource: string | undefined;
		let previousResult = '';
		return (value: string) => {
			if (value !== previousSource) {
				previousSource = value;
				previousResult = renderMarkdown(value);
			}
			return previousResult;
		};
	})();

	let html = $derived(render(source));
</script>

<!-- html is produced by renderMarkdown's strict renderer and sanitizer allowlist. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class:markdown-compact={compact} class="markdown">{@html html}</div>
