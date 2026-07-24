<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();
	let restarting = $state(false);

	async function restart(): Promise<void> {
		if (!client) return;
		restarting = true;
		try {
			const response = await client.sendCommand('restart_pi');
			if (!response.success) app.addToast(response.error ?? 'Pi could not be restarted.', 'error');
		} catch (error) {
			app.addToast(error instanceof Error ? error.message : String(error), 'error');
		} finally {
			restarting = false;
		}
	}
</script>

{#if !app.pi.available}
	<section
		class="mx-auto mt-4 w-full max-w-4xl rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900"
	>
		<h2 class="font-semibold">Pi is unavailable</h2>
		<p class="mt-1 leading-6">
			{app.pi.message ??
				'The Pi child process stopped. Your visible conversation has been preserved.'}
		</p>
		<button
			type="button"
			class="mt-3 min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:outline-none disabled:bg-red-300"
			onclick={() => void restart()}
			disabled={restarting || app.connection.status !== 'connected'}
			>{restarting ? 'Restarting Pi…' : 'Restart Pi'}</button
		>
	</section>
{/if}
