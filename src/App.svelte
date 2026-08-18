<script lang="ts">
	import AppShell from './lib/components/AppShell.svelte';
	import { AppState } from './lib/state/app-state.svelte';
	import { setAppState } from './lib/state/app-context.svelte';

	setAppState(new AppState());
</script>

<AppShell />
