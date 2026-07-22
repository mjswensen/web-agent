<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { AppState } from '$lib/state/app-state.svelte';
	import { setAppState } from '$lib/state/app-context.svelte';

	let { children } = $props();
	setAppState(new AppState());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
