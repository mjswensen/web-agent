<script lang="ts">
	import type { WebAgentWebSocketClient } from '../client/ws-client';
	import type { AppState } from '../state/app-state.svelte';
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
	class="border-t border-slate-300 bg-white/95 px-4 py-3 shadow-[0_-12px_32px_-24px_rgb(15_23_42/0.65)] backdrop-blur-md sm:px-6 dark:border-slate-700 dark:bg-slate-900/95"
	aria-label="Message editor"
>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-2">
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
			class="border border-slate-300 bg-slate-50 p-2 shadow-[3px_3px_0_rgb(148_163_184/0.25)] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:shadow-none dark:focus-within:ring-blue-900"
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
					? 'Add direction while Pi is working…'
					: 'Describe the outcome you want…'}
				class="min-h-20 w-full resize-y border-0 bg-transparent px-2 py-1 shadow-none transition outline-none placeholder:text-slate-400 focus:border-transparent focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-transparent dark:disabled:bg-slate-900"
				disabled={!isConnected}
			/>
			<div
				class="mt-2 flex items-end justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-800"
			>
				<div class="hidden min-w-0 pb-1 pl-2 text-[10px] leading-4 text-slate-500 sm:block">
					<p>
						{app.isAgentActive ? 'Steer adjusts the active run' : 'Send starts a new agent turn'}
					</p>
					<p class="text-slate-400">Command + Enter to {action.toLowerCase()}</p>
				</div>
				<div class="ml-auto flex justify-end gap-2">
					{#if app.isAgentActive}
						<Button
							type="button"
							variant="soft-red"
							size="touch"
							class="inline-flex min-w-11 shrink-0 items-center justify-center gap-2 !px-3"
							title="Abort"
							aria-label="Abort"
							onclick={() => void abort()}
							disabled={!isConnected}
						>
							<Icon name="stop" class="size-4" />
							<span class="hidden sm:inline">Abort</span>
						</Button>
						<Button
							type="button"
							variant="soft-blue"
							size="touch"
							class="inline-flex min-w-11 shrink-0 items-center justify-center gap-2 !px-3"
							title="Follow-up"
							aria-label="Follow-up"
							onclick={() => void queueFollowUp()}
							disabled={!canSend}
						>
							<Icon name="arrow-turn-down-left" class="size-4" />
							<span class="hidden sm:inline">Follow-up</span>
						</Button>
					{/if}
					<Button
						type="submit"
						variant="primary"
						size="touch"
						class="inline-flex min-w-11 shrink-0 items-center justify-center gap-2 !px-4"
						title={action}
						aria-label={action}
						disabled={!canSend}
					>
						<Icon name={app.isAgentActive ? 'cog-8-tooth' : 'paper-airplane'} class="size-4" />
						<span class="hidden sm:inline">{action}</span>
					</Button>
				</div>
			</div>
		</form>
	</div>
</section>
