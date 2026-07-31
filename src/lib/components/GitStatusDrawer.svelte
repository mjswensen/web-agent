<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState, GitFileStatus } from '$lib/state/app-state.svelte';
	import DiffView from './DiffView.svelte';
	import Button from './core/Button.svelte';
	import DialogHeader from './core/DialogHeader.svelte';
	import DialogShell from './core/DialogShell.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();
	let refreshing = $state(false);

	async function loadFullDiff(token: string): Promise<void> {
		if (!client) return;
		app.startGitDiff(token);
		try {
			const response = await client.sendCommand('get_git_diff', { token });
			if (!response.success)
				app.failGitDiff(token, response.error ?? 'Unable to load the full diff.');
		} catch (error) {
			app.failGitDiff(token, error instanceof Error ? error.message : String(error));
		}
	}

	async function refresh(): Promise<void> {
		if (!client || refreshing) return;
		refreshing = true;
		try {
			const response = await client.sendCommand('get_git_status');
			if (!response.success) app.addToast(response.error ?? 'Unable to refresh changes.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			refreshing = false;
		}
	}

	type Badge = { label: string; className: string };

	function statusClass(status: string): string {
		switch (status) {
			case 'A':
				return 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
			case 'D':
				return 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200';
			case 'R':
			case 'C':
				return 'border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200';
			case 'U':
				return 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200';
			default:
				return 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200';
		}
	}

	function badges(file: GitFileStatus): Badge[] {
		return [
			...(file.untracked
				? [
						{
							label: 'Untracked',
							className:
								'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
						}
					]
				: []),
			...(file.conflicted
				? [
						{
							label: 'Conflicted',
							className:
								'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200'
						}
					]
				: []),
			...(file.indexStatus
				? [{ label: `Staged ${file.indexStatus}`, className: statusClass(file.indexStatus) }]
				: []),
			...(file.worktreeStatus && !file.untracked
				? [
						{
							label: `Unstaged ${file.worktreeStatus}`,
							className: statusClass(file.worktreeStatus)
						}
					]
				: []),
			...(file.binary
				? [
						{
							label: 'Binary',
							className:
								'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
						}
					]
				: [])
		];
	}
</script>

{#if app.layout.gitStatusDrawerOpen}
	<DialogShell kind="drawer" maxWidth="xl" ariaLabel="Changes">
		<DialogHeader title="Changes" description="Read-only Git worktree snapshot.">
			{#snippet actions()}
				<Button
					variant="secondary"
					size="touch"
					disabled={refreshing}
					onclick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button
				>
				<Button variant="muted" size="sm" onclick={() => (app.layout.gitStatusDrawerOpen = false)}
					>Close</Button
				>
			{/snippet}
		</DialogHeader>
		<div class="min-h-0 flex-1 overflow-y-auto p-3">
			{#if !app.gitStatus}
				<p class="px-2 py-8 text-center text-sm text-slate-500">Loading Git status…</p>
			{:else if app.gitStatus.state === 'not_repository'}
				<p class="px-2 py-8 text-center text-sm text-slate-500">
					The launch directory is not inside a Git worktree.
				</p>
			{:else if app.gitStatus.state === 'error'}
				<div
					class="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
				>
					<p>{app.gitStatus.message}</p>
					<p class="mt-2 text-xs">Try Refresh after resolving the Git problem.</p>
				</div>
			{:else}
				<div
					class="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
				>
					<p>
						<span class="font-semibold">Branch:</span>
						{app.gitStatus.branch.name}{app.gitStatus.branch.oid
							? ` (${app.gitStatus.branch.oid.slice(0, 12)})`
							: ''}
					</p>
					<p class="mt-1 break-all">
						<span class="font-semibold">Root:</span>
						{app.gitStatus.repositoryRoot}
					</p>
					<p class="mt-1">
						<span class="font-semibold">Files:</span>
						{app.gitStatus.files.length} · <span class="font-semibold">Refreshed:</span>
						{app.gitStatus.refreshedAt}
					</p>
				</div>
				{#if app.gitStatus.files.length === 0}
					<p class="px-2 py-8 text-center text-sm text-slate-500">The worktree is clean.</p>
				{:else}
					<div class="space-y-3">
						{#each app.gitStatus.files as file (file.path)}
							{@const stagedFull = app.gitDiff(file.stagedDiffToken)}
							{@const unstagedFull = app.gitDiff(file.unstagedDiffToken)}
							<article class="rounded border border-slate-200 p-3 dark:border-slate-700">
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="text-sm font-semibold break-all">{file.path}</h3>
									{#each badges(file) as badge (badge.label)}<span
											class={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
											>{badge.label}</span
										>{/each}
								</div>
								{#if file.originalPath}<p class="mt-1 text-xs break-all text-slate-500">
										from {file.originalPath}
									</p>{/if}
								{#if file.stagedDiff !== undefined || file.stagedDiffError || stagedFull}
									<h4 class="mt-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
										Staged
									</h4>
									{#if stagedFull}<DiffView
											diff={stagedFull.content}
										/>{:else if file.stagedDiff !== undefined}<DiffView
											diff={file.stagedDiff}
										/>{:else if file.stagedDiffError}<p
											class="mt-1 text-xs text-amber-700 dark:text-amber-300"
										>
											{file.stagedDiffError}
										</p>{/if}
									{#if stagedFull?.error}<p class="mt-1 text-xs text-rose-700 dark:text-rose-300">
											{stagedFull.error}
										</p>{/if}
									{#if file.stagedDiffTruncated && file.stagedDiffToken && !stagedFull?.complete}<Button
											variant="secondary"
											size="touch"
											class="mt-2"
											disabled={stagedFull?.loading}
											onclick={() => void loadFullDiff(file.stagedDiffToken!)}
											>{stagedFull?.loading ? 'Loading full diff…' : 'Load full diff'}</Button
										>{/if}
								{/if}
								{#if file.unstagedDiff !== undefined || file.unstagedDiffError || file.untracked || unstagedFull}
									<h4 class="mt-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
										{file.untracked ? 'Untracked preview' : 'Unstaged'}
									</h4>
									{#if unstagedFull}<DiffView
											diff={unstagedFull.content}
										/>{:else if file.unstagedDiff !== undefined}<DiffView
											diff={file.unstagedDiff}
										/>{:else if file.unstagedDiffError}<p
											class="mt-1 text-xs text-amber-700 dark:text-amber-300"
										>
											{file.unstagedDiffError}
										</p>{:else}<p class="mt-1 text-xs text-amber-700 dark:text-amber-300">
											Preview has not been loaded.
										</p>{/if}
									{#if unstagedFull?.error}<p class="mt-1 text-xs text-rose-700 dark:text-rose-300">
											{unstagedFull.error}
										</p>{/if}
									{#if file.unstagedDiffTruncated && file.unstagedDiffToken && !unstagedFull?.complete}<Button
											variant="secondary"
											size="touch"
											class="mt-2"
											disabled={unstagedFull?.loading}
											onclick={() => void loadFullDiff(file.unstagedDiffToken!)}
											>{unstagedFull?.loading ? 'Loading full diff…' : 'Load full diff'}</Button
										>{/if}
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</DialogShell>
{/if}
