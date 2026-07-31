<script lang="ts">
	import './layout.css';
	import { AppState } from '$lib/state/app-state.svelte';
	import { setAppState } from '$lib/state/app-context.svelte';

	let { children } = $props();
	setAppState(new AppState());
</script>

<svelte:head>
	<link rel="icon" href="/web-agent.png" type="image/png" />
	<link rel="apple-touch-icon" href="/web-agent.png" />
</svelte:head>
{@render children()}
