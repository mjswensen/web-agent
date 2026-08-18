<script lang="ts">
	import './app.css';
	import { AppState } from '$lib/state/app-state.svelte';
	import { setAppState } from '$lib/state/app-context.svelte';
	import AppShell from '$lib/components/AppShell.svelte';

	setAppState(new AppState());
</script>

<AppShell />
