import { useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';
import { DialogHeader } from './core/DialogHeader';
import { DialogShell } from './core/DialogShell';
import { TextField } from './core/TextField';

export function SessionDrawer() {
	const app = useAppState();
	const client = useWsClient();
	const [renaming, setRenaming] = useState(false);
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);

	function sessionTitle(session: Record<string, unknown>): string {
		if (typeof session.name === 'string' && session.name) return session.name;
		if (typeof session.firstMessage === 'string' && session.firstMessage)
			return session.firstMessage;
		return typeof session.id === 'string' ? session.id : 'Untitled session';
	}

	async function command(
		cmd: 'new_session' | 'switch_session' | 'clone',
		params: Record<string, string> = {}
	) {
		if (!client) return;
		setBusy(true);
		try {
			const response = await client.sendCommand(cmd, params);
			if (!response.success) app.addToast(response.error ?? `Unable to ${cmd}.`, 'error');
			else if (cmd === 'new_session' || cmd === 'switch_session')
				app.setLayout('sessionDrawerOpen', false);
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function rename() {
		if (!client || !name.trim()) return;
		setBusy(true);
		try {
			const response = await client.sendCommand('set_session_name', { name: name.trim() });
			if (response.success) {
				setRenaming(false);
				await Promise.all([
					client.sendCommand('get_state'),
					client.sendCommand('get_session_list')
				]);
			} else app.addToast(response.error ?? 'Unable to rename the session.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	if (!app.layout.sessionDrawerOpen) return null;

	return (
		<DialogShell kind="drawer" maxWidth="xl" ariaLabel="Sessions">
			<DialogHeader
				title="Sessions"
				description="Changing sessions affects every connected tab."
				actions={
					<Button
						variant="muted"
						size="sm"
						onClick={() => app.setLayout('sessionDrawerOpen', false)}
					>
						Close
					</Button>
				}
			/>
			<div className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
				<Button
					variant="primary"
					size="touch"
					onClick={() => void command('new_session')}
					disabled={busy || app.sessionTransition}
				>
					New session
				</Button>
				<Button
					variant="secondary"
					size="touch"
					onClick={() => void command('clone')}
					disabled={busy || app.sessionTransition}
				>
					Clone active
				</Button>
				<Button
					variant="secondary"
					size="touch"
					onClick={() => {
						setRenaming(!renaming);
						setName(app.sessionName ?? '');
					}}
					disabled={busy || app.sessionTransition}
				>
					Rename
				</Button>
			</div>
			{renaming && (
				<form
					className="flex gap-2 border-b border-slate-200 p-3 dark:border-slate-700"
					onSubmit={(event) => {
						event.preventDefault();
						void rename();
					}}
				>
					<TextField
						className="min-w-0 flex-1"
						value={name}
						onChange={(e) => setName(e.target.value)}
						aria-label="Session name"
					/>
					<Button variant="muted" size="touch" onClick={() => setRenaming(false)}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						size="touch"
						className="px-3"
						disabled={!name.trim() || busy}
					>
						Save
					</Button>
				</form>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto p-3">
				{app.sessionList.length === 0 && (
					<p className="px-2 py-8 text-center text-sm text-slate-500">
						No saved sessions were found for this project.
					</p>
				)}
				{app.sessionList.map((session) => (
					<button
						key={typeof session.path === 'string' ? session.path : JSON.stringify(session)}
						type="button"
						className={`mb-2 w-full rounded-lg border px-3 py-3 text-left focus:ring-2 focus:ring-blue-500 focus:outline-none ${session.path === app.sessionState?.sessionFile ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
						onClick={() =>
							typeof session.path === 'string' &&
							void command('switch_session', { sessionPath: session.path as string })
						}
						disabled={busy || app.sessionTransition}
					>
						<span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
							{sessionTitle(session)}
						</span>
						{typeof session.modified === 'string' && (
							<span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
								Updated {new Date(session.modified as string).toLocaleString()} ·{' '}
								{typeof session.messageCount === 'number'
									? `${session.messageCount} messages`
									: '—'}
							</span>
						)}
					</button>
				))}
			</div>
		</DialogShell>
	);
}
