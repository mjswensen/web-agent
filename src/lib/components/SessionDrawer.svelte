<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState } from '$lib/state/app-state.svelte';

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
			if (response.success) renaming = false;
			else app.addToast(response.error ?? 'Unable to rename the session.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			busy = false;
		}
	}
</script>

{#if app.layout.sessionDrawerOpen}
	<div class="fixed inset-0 z-30 bg-slate-950/30 p-3 sm:p-6" role="presentation">
		<div
			class="ml-auto flex h-full w-full max-w-xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Sessions"
		>
			<header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<div>
					<h2 class="text-base font-semibold text-slate-900">Sessions</h2>
					<p class="mt-1 text-xs text-slate-500">Changing sessions affects every connected tab.</p>
				</div>
				<button
					type="button"
					class="min-h-9 rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
					onclick={() => (app.layout.sessionDrawerOpen = false)}>Close</button
				>
			</header>
			<div class="flex flex-wrap gap-2 border-b border-slate-200 p-3">
				<button
					type="button"
					class="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:bg-slate-300"
					onclick={() => void command('new_session')}
					disabled={busy || app.sessionTransition}>New session</button
				><button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
					onclick={() => void command('clone')}
					disabled={busy || app.sessionTransition}>Clone active</button
				><button
					type="button"
					class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
					onclick={() => {
						renaming = !renaming;
						name = app.sessionName ?? '';
					}}
					disabled={busy || app.sessionTransition}>Rename</button
				>
			</div>
			{#if renaming}<form
					class="flex gap-2 border-b border-slate-200 p-3"
					onsubmit={(event) => {
						event.preventDefault();
						void rename();
					}}
				>
					<input
						class="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
						bind:value={name}
						aria-label="Session name"
					/><button
						type="submit"
						class="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white disabled:bg-slate-300"
						disabled={!name.trim() || busy}>Save</button
					>
				</form>{/if}
			<div class="min-h-0 flex-1 overflow-y-auto p-3">
				{#if app.sessionList.length === 0}<p class="px-2 py-8 text-center text-sm text-slate-500">
						No saved sessions were found for this project.
					</p>{/if}
				{#each app.sessionList as session (typeof session.path === 'string' ? session.path : JSON.stringify(session))}
					<button
						type="button"
						class={`mb-2 w-full rounded-lg border px-3 py-3 text-left focus:ring-2 focus:ring-blue-500 focus:outline-none ${session.path === app.sessionState?.sessionFile ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
						onclick={() =>
							typeof session.path === 'string' &&
							void command('switch_session', { sessionPath: session.path })}
						disabled={busy || app.sessionTransition}
					>
						<span class="block truncate text-sm font-semibold text-slate-800"
							>{sessionTitle(session)}</span
						>
						{#if typeof session.modified === 'string'}<span
								class="mt-1 block text-xs text-slate-500"
								>Updated {new Date(session.modified).toLocaleString()} · {typeof session.messageCount ===
								'number'
									? `${session.messageCount} messages`
									: '—'}</span
							>{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
