<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();

	let sending = $state(false);
	let isConnected = $derived(app.canMutateSession);
	let action = $derived(app.isAgentActive ? 'Steer' : 'Send');
	let canSend = $derived(isConnected && !sending && app.editorText.trim().length > 0);

	async function submit(): Promise<void> {
		if (!client || !canSend) return;
		sending = true;
		try {
			const response = await client.sendCommand(app.isAgentActive ? 'steer' : 'prompt', {
				message: app.editorText
			});
			if (response.success) app.editorText = '';
			else app.setConnectionError(response.error ?? `${action} was rejected by Pi.`);
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			sending = false;
		}
	}

	async function queueFollowUp(): Promise<void> {
		if (!client || !canSend || !app.isAgentActive) return;
		sending = true;
		try {
			const response = await client.sendCommand('follow_up', { message: app.editorText });
			if (response.success) app.editorText = '';
			else app.setConnectionError(response.error ?? 'Pi could not queue the follow-up.');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			sending = false;
		}
	}

	async function abort(): Promise<void> {
		if (!client || !isConnected || !app.isAgentActive) return;
		try {
			const response = await client.sendCommand('abort');
			if (!response.success)
				app.setConnectionError(response.error ?? 'Pi could not abort the active run.');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}
</script>

<section
	class="border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-8px_24px_-20px_rgb(15_23_42/0.45)] sm:px-6"
	aria-label="Message editor"
>
	<div class="mx-auto flex w-full max-w-4xl flex-col gap-2">
		{#if !app.pi.available}
			<p class="text-xs text-red-700">{app.pi.message ?? 'Pi is unavailable.'}</p>
		{:else if app.connection.status !== 'connected'}
			<p class="text-xs text-amber-700">
				{app.connection.status === 'connecting'
					? 'Connecting to the local agent…'
					: app.connection.reconnectAttempt > 0
						? `Reconnecting (attempt ${app.connection.reconnectAttempt})…`
						: 'Waiting for the local agent connection.'}
			</p>
		{/if}
		<form
			class="flex items-end gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<label class="sr-only" for="prompt-editor">Message Pi</label>
			<textarea
				id="prompt-editor"
				bind:value={app.editorText}
				oninput={(event) => {
					if (event.currentTarget.value.startsWith('/')) app.layout.commandPaletteOpen = true;
				}}
				rows="3"
				placeholder={app.isAgentActive
					? 'Steer the current run…'
					: 'Describe the task you want Pi to do…'}
				class="min-h-24 flex-1 resize-y rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-900 transition outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"
				disabled={!isConnected}></textarea>
			<div class="flex flex-col gap-2">
				<button
					type="submit"
					class="min-h-11 min-w-24 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-300"
					disabled={!canSend}
				>
					{sending ? 'Sending…' : action}
				</button>
				{#if app.isAgentActive}
					<button
						type="button"
						class="min-h-11 min-w-24 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						onclick={() => void queueFollowUp()}
						disabled={!canSend}
					>
						Follow-up
					</button>
					<button
						type="button"
						class="min-h-11 min-w-24 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						onclick={() => void abort()}
						disabled={!isConnected}
					>
						Abort
					</button>
				{/if}
			</div>
		</form>
		<p class="text-[11px] leading-4 text-slate-500">
			Enter adds a new line. Use {action} to deliver this message.
		</p>
	</div>
</section>
