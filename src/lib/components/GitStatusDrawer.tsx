import { useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import type { GitFileStatus } from '$lib/state/app-state';
import { DiffView } from './DiffView';
import { Button } from './core/Button';
import { DialogHeader } from './core/DialogHeader';
import { DialogShell } from './core/DialogShell';

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
			? [{ label: `Unstaged ${file.worktreeStatus}`, className: statusClass(file.worktreeStatus) }]
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

export function GitStatusDrawer() {
	const app = useAppState();
	const client = useWsClient();
	const [refreshing, setRefreshing] = useState(false);

	async function loadFullDiff(token: string) {
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

	async function refresh() {
		if (!client || refreshing) return;
		setRefreshing(true);
		try {
			const response = await client.sendCommand('get_git_status');
			if (!response.success) app.addToast(response.error ?? 'Unable to refresh changes.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setRefreshing(false);
		}
	}

	if (!app.layout.gitStatusDrawerOpen) return null;

	return (
		<DialogShell kind="drawer" maxWidth="xl" ariaLabel="Changes">
			<DialogHeader
				title="Changes"
				description="Read-only Git worktree snapshot."
				actions={
					<>
						<Button
							variant="secondary"
							size="touch"
							disabled={refreshing}
							onClick={() => void refresh()}
						>
							{refreshing ? 'Refreshing…' : 'Refresh'}
						</Button>
						<Button
							variant="muted"
							size="sm"
							onClick={() => app.setLayout('gitStatusDrawerOpen', false)}
						>
							Close
						</Button>
					</>
				}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto p-3">
				{!app.gitStatus && (
					<p className="px-2 py-8 text-center text-sm text-slate-500">Loading Git status…</p>
				)}
				{app.gitStatus?.state === 'not_repository' && (
					<p className="px-2 py-8 text-center text-sm text-slate-500">
						The launch directory is not inside a Git worktree.
					</p>
				)}
				{app.gitStatus?.state === 'error' && (
					<div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
						<p>{app.gitStatus.message}</p>
						<p className="mt-2 text-xs">Try Refresh after resolving the Git problem.</p>
					</div>
				)}
				{app.gitStatus?.state === 'ready' && (
					<>
						<div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
							<p>
								<span className="font-semibold">Branch:</span> {app.gitStatus.branch.name}
								{app.gitStatus.branch.oid ? ` (${app.gitStatus.branch.oid.slice(0, 12)})` : ''}
							</p>
							<p className="mt-1 break-all">
								<span className="font-semibold">Root:</span> {app.gitStatus.repositoryRoot}
							</p>
							<p className="mt-1">
								<span className="font-semibold">Files:</span> {app.gitStatus.files.length} ·{' '}
								<span className="font-semibold">Refreshed:</span> {app.gitStatus.refreshedAt}
							</p>
						</div>
						{app.gitStatus.files.length === 0 ? (
							<p className="px-2 py-8 text-center text-sm text-slate-500">The worktree is clean.</p>
						) : (
							<div className="space-y-3">
								{app.gitStatus.files.map((file) => {
									const stagedFull = app.gitDiff(file.stagedDiffToken);
									const unstagedFull = app.gitDiff(file.unstagedDiffToken);
									return (
										<article
											key={file.path}
											className="rounded border border-slate-200 p-3 dark:border-slate-700"
										>
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="text-sm font-semibold break-all">{file.path}</h3>
												{badges(file).map((badge) => (
													<span
														key={badge.label}
														className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
													>
														{badge.label}
													</span>
												))}
											</div>
											{file.originalPath && (
												<p className="mt-1 text-xs break-all text-slate-500">
													from {file.originalPath}
												</p>
											)}
											{(file.stagedDiff !== undefined || file.stagedDiffError || stagedFull) && (
												<>
													<h4 className="mt-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
														Staged
													</h4>
													{stagedFull ? (
														<DiffView diff={stagedFull.content} />
													) : file.stagedDiff !== undefined ? (
														<DiffView diff={file.stagedDiff} />
													) : file.stagedDiffError ? (
														<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
															{file.stagedDiffError}
														</p>
													) : null}
													{stagedFull?.error && (
														<p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
															{stagedFull.error}
														</p>
													)}
													{file.stagedDiffTruncated &&
														file.stagedDiffToken &&
														!stagedFull?.complete && (
															<Button
																variant="secondary"
																size="touch"
																className="mt-2"
																disabled={stagedFull?.loading}
																onClick={() => void loadFullDiff(file.stagedDiffToken!)}
															>
																{stagedFull?.loading ? 'Loading full diff…' : 'Load full diff'}
															</Button>
														)}
												</>
											)}
											{(file.unstagedDiff !== undefined ||
												file.unstagedDiffError ||
												file.untracked ||
												unstagedFull) && (
												<>
													<h4 className="mt-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
														{file.untracked ? 'Untracked preview' : 'Unstaged'}
													</h4>
													{unstagedFull ? (
														<DiffView diff={unstagedFull.content} />
													) : file.unstagedDiff !== undefined ? (
														<DiffView diff={file.unstagedDiff} />
													) : file.unstagedDiffError ? (
														<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
															{file.unstagedDiffError}
														</p>
													) : (
														<p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
															Preview has not been loaded.
														</p>
													)}
													{unstagedFull?.error && (
														<p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
															{unstagedFull.error}
														</p>
													)}
													{file.unstagedDiffTruncated &&
														file.unstagedDiffToken &&
														!unstagedFull?.complete && (
															<Button
																variant="secondary"
																size="touch"
																className="mt-2"
																disabled={unstagedFull?.loading}
																onClick={() => void loadFullDiff(file.unstagedDiffToken!)}
															>
																{unstagedFull?.loading ? 'Loading full diff…' : 'Load full diff'}
															</Button>
														)}
												</>
											)}
										</article>
									);
								})}
							</div>
						)}
					</>
				)}
			</div>
		</DialogShell>
	);
}
