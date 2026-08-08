<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';
	import Button from './core/Button.svelte';
	import Textarea from './core/Textarea.svelte';
	import Icon from './Icon.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();

	let sending = $state(false);
	let isConnected = $derived(app.canMutateSession);
	let action = $derived(app.isAgentActive ? 'Steer' : 'Send');
	let canSend = $derived(isConnected && !sending && app.editorText.trim().length > 0);
	let wasSlashEntry = false;

	function hasOverlay(): boolean {
		return Boolean(
			app.activeDialog ||
			app.layout.commandPaletteOpen ||
			app.layout.modelDialogOpen ||
			app.layout.thinkingDialogOpen ||
			app.layout.compactDialogOpen ||
			app.layout.sessionDrawerOpen ||
			app.layout.treeDrawerOpen ||
			app.layout.mobileActionsOpen
		);
	}

	function editorInput(value: string): void {
		const isSlashEntry = value.startsWith('/');
		if (isSlashEntry && !wasSlashEntry) app.layout.commandPaletteOpen = true;
		wasSlashEntry = isSlashEntry;
	}

	function editorKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' || !event.metaKey || event.shiftKey || hasOverlay()) return;
		if (!client || !canSend) return;
		event.preventDefault();
		void submit();
	}

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
	class="border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-8px_24px_-20px_rgb(15_23_42/0.45)] sm:px-6 dark:border-slate-700 dark:bg-slate-900"
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
			class="flex flex-col gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<label class="sr-only" for="prompt-editor">Message Pi</label>
			<Textarea
				id="prompt-editor"
				bind:value={app.editorText}
				oninput={(event) => editorInput(event.currentTarget.value)}
				onkeydown={editorKeydown}
				rows={3}
				placeholder={app.isAgentActive
					? 'Steer the current run…'
					: 'Describe the task you want Pi to do…'}
				class="min-h-24 w-full resize-y bg-slate-50 transition outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
				disabled={!isConnected}
			/>
			<div class="flex justify-end gap-2">
				{#if app.isAgentActive}
					<Button
						type="button"
						variant="soft-red"
						size="touch"
						class="inline-flex size-11 shrink-0 items-center justify-center !p-0"
						title="Abort"
						aria-label="Abort"
						onclick={() => void abort()}
						disabled={!isConnected}
					>
						<Icon name="stop" class="size-5" />
					</Button>
					<Button
						type="button"
						variant="soft-blue"
						size="touch"
						class="inline-flex size-11 shrink-0 items-center justify-center !p-0"
						title="Follow-up"
						aria-label="Follow-up"
						onclick={() => void queueFollowUp()}
						disabled={!canSend}
					>
						<Icon name="arrow-turn-down-left" class="size-5" />
					</Button>
				{/if}
				<Button
					type="submit"
					variant="primary"
					size="touch"
					class="inline-flex size-11 shrink-0 items-center justify-center !p-0"
					title={action}
					aria-label={action}
					disabled={!canSend}
				>
					<Icon name={app.isAgentActive ? 'cog-8-tooth' : 'paper-airplane'} class="size-5" />
				</Button>
			</div>
		</form>
	</div>
</section>
