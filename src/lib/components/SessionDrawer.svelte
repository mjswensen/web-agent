<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';
	import Button from './core/Button.svelte';
	import DialogHeader from './core/DialogHeader.svelte';
	import DialogShell from './core/DialogShell.svelte';
	import TextField from './core/TextField.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();
	let renaming = $state(false);
	let name = $state('');
	let busy = $state(false);

	function sessionTitle(session: Record<string, unknown>): string {
		if (typeof session.name === 'string' && session.name) return session.name;
		if (typeof session.firstMessage === 'string' && session.firstMessage)
			return session.firstMessage;
		return typeof session.id === 'string' ? session.id : 'Untitled session';
	}

	async function command(
		command: 'new_session' | 'switch_session' | 'clone',
		params: Record<string, string> = {}
	): Promise<void> {
		if (!client) return;
		busy = true;
		try {
			const response = await client.sendCommand(command, params);
			if (!response.success) app.addToast(response.error ?? `Unable to ${command}.`, 'error');
			else if (command === 'new_session' || command === 'switch_session')
				app.layout.sessionDrawerOpen = false;
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			busy = false;
		}
	}

	async function rename(): Promise<void> {
		if (!client || !name.trim()) return;
		busy = true;
		try {
			const response = await client.sendCommand('set_session_name', { name: name.trim() });
			if (response.success) {
				renaming = false;
				await Promise.all([
					client.sendCommand('get_state'),
					client.sendCommand('get_session_list')
				]);
			} else app.addToast(response.error ?? 'Unable to rename the session.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			busy = false;
		}
	}
</script>

{#if app.layout.sessionDrawerOpen}
	<DialogShell kind="drawer" maxWidth="xl" ariaLabel="Sessions">
		<DialogHeader title="Sessions" description="Changing sessions affects every connected tab.">
			{#snippet actions()}
				<Button variant="muted" size="sm" onclick={() => (app.layout.sessionDrawerOpen = false)}
					>Close</Button
				>
			{/snippet}
		</DialogHeader>
		<div class="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
			<Button
				variant="primary"
				size="touch"
				onclick={() => void command('new_session')}
				disabled={busy || app.sessionTransition}>New session</Button
			><Button
				variant="secondary"
				size="touch"
				onclick={() => void command('clone')}
				disabled={busy || app.sessionTransition}>Clone active</Button
			><Button
				variant="secondary"
				size="touch"
				onclick={() => {
					renaming = !renaming;
					name = app.sessionName ?? '';
				}}
				disabled={busy || app.sessionTransition}>Rename</Button
			>
		</div>
		{#if renaming}<form
				class="flex gap-2 border-b border-slate-200 p-3 dark:border-slate-700"
				onsubmit={(event) => {
					event.preventDefault();
					void rename();
				}}
			>
				<TextField class="min-w-0 flex-1" bind:value={name} aria-label="Session name" />
				<Button variant="muted" size="touch" onclick={() => (renaming = false)}>Cancel</Button>
				<Button
					type="submit"
					variant="primary"
					size="touch"
					class="px-3"
					disabled={!name.trim() || busy}>Save</Button
				>
			</form>{/if}
		<div class="min-h-0 flex-1 overflow-y-auto p-3">
			{#if app.sessionList.length === 0}<p class="px-2 py-8 text-center text-sm text-slate-500">
					No saved sessions were found for this project.
				</p>{/if}
			{#each app.sessionList as session (typeof session.path === 'string' ? session.path : JSON.stringify(session))}
				<button
					type="button"
					class={`mb-2 w-full rounded-lg border px-3 py-3 text-left focus:ring-2 focus:ring-blue-500 focus:outline-none ${session.path === app.sessionState?.sessionFile ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
					onclick={() =>
						typeof session.path === 'string' &&
						void command('switch_session', { sessionPath: session.path })}
					disabled={busy || app.sessionTransition}
				>
					<span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100"
						>{sessionTitle(session)}</span
					>
					{#if typeof session.modified === 'string'}<span
							class="mt-1 block text-xs text-slate-500 dark:text-slate-400"
							>Updated {new Date(session.modified).toLocaleString()} · {typeof session.messageCount ===
							'number'
								? `${session.messageCount} messages`
								: '—'}</span
						>{/if}
				</button>
			{/each}
		</div>
	</DialogShell>
{/if}
