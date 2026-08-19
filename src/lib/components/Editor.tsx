import { useState, useRef } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';
import { Textarea } from './core/Textarea';
import { Icon } from './Icon';

export function Editor() {
	const app = useAppState();
	const client = useWsClient();
	const [sending, setSending] = useState(false);
	const wasSlashEntry = useRef(false);

	const isConnected = app.canMutateSession;
	const action = app.isAgentActive ? 'Steer' : 'Send';
	const canSend = isConnected && !sending && app.editorText.trim().length > 0;

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

	function editorInput(value: string) {
		const isSlash = value.startsWith('/');
		if (isSlash && !wasSlashEntry.current) app.setLayout('commandPaletteOpen', true);
		wasSlashEntry.current = isSlash;
	}

	function editorKeydown(event: React.KeyboardEvent) {
		if (event.key !== 'Enter' || !event.metaKey || event.shiftKey || hasOverlay()) return;
		if (!client || !canSend) return;
		event.preventDefault();
		void submit();
	}

	async function submit() {
		if (!client || !canSend) return;
		setSending(true);
		try {
			const response = await client.sendCommand(app.isAgentActive ? 'steer' : 'prompt', {
				message: app.editorText
			});
			if (response.success) app.setEditorText('');
			else app.setConnectionError(response.error ?? `${action} was rejected by Pi.`);
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setSending(false);
		}
	}

	async function queueFollowUp() {
		if (!client || !canSend || !app.isAgentActive) return;
		setSending(true);
		try {
			const response = await client.sendCommand('follow_up', { message: app.editorText });
			if (response.success) app.setEditorText('');
			else app.setConnectionError(response.error ?? 'Pi could not queue the follow-up.');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setSending(false);
		}
	}

	async function abort() {
		if (!client || !isConnected || !app.isAgentActive) return;
		try {
			const response = await client.sendCommand('abort');
			if (!response.success)
				app.setConnectionError(response.error ?? 'Pi could not abort the active run.');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	return (
		<section
			className="border-t border-slate-300 bg-white/95 px-4 py-3 shadow-[0_-12px_32px_-24px_rgb(15_23_42/0.65)] backdrop-blur-md sm:px-6 dark:border-slate-700 dark:bg-slate-900/95"
			aria-label="Message editor"
		>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
				{!app.pi.available ? (
					<p className="text-xs text-red-700">{app.pi.message ?? 'Pi is unavailable.'}</p>
				) : app.connection.status !== 'connected' ? (
					<p className="text-xs text-amber-700">
						{app.connection.status === 'connecting'
							? 'Connecting to the local agent…'
							: app.connection.reconnectAttempt > 0
								? `Reconnecting (attempt ${app.connection.reconnectAttempt})…`
								: 'Waiting for the local agent connection.'}
					</p>
				) : null}
				<form
					className="border border-slate-300 bg-slate-50 p-2 shadow-[3px_3px_0_rgb(148_163_184/0.25)] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:shadow-none dark:focus-within:ring-blue-900"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<label className="sr-only" htmlFor="prompt-editor">
						Message Pi
					</label>
					<Textarea
						id="prompt-editor"
						value={app.editorText}
						onChange={(e) => {
							app.setEditorText(e.target.value);
							editorInput(e.target.value);
						}}
						onKeyDown={editorKeydown}
						rows={3}
						placeholder={
							app.isAgentActive
								? 'Add direction while Pi is working…'
								: 'Describe the outcome you want…'
						}
						className="min-h-20 w-full resize-y border-0 bg-transparent px-2 py-1 shadow-none transition outline-none placeholder:text-slate-400 focus:border-transparent focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-transparent dark:disabled:bg-slate-900"
						disabled={!isConnected}
					/>
					<div className="mt-2 flex items-end justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-800">
						<div className="hidden min-w-0 pb-1 pl-2 text-[10px] leading-4 text-slate-500 sm:block">
							<p>
								{app.isAgentActive
									? 'Steer adjusts the active run'
									: 'Send starts a new agent turn'}
							</p>
							<p className="text-slate-400">Command + Enter to {action.toLowerCase()}</p>
						</div>
						<div className="ml-auto flex justify-end gap-2">
							{app.isAgentActive && (
								<>
									<Button
										type="button"
										variant="soft-red"
										size="touch"
										className="inline-flex min-w-11 shrink-0 items-center justify-center gap-2 !px-3"
										title="Abort"
										aria-label="Abort"
										onClick={() => void abort()}
										disabled={!isConnected}
									>
										<Icon name="stop" className="size-4" />
										<span className="hidden sm:inline">Abort</span>
									</Button>
									<Button
										type="button"
										variant="soft-blue"
										size="touch"
										className="inline-flex min-w-11 shrink-0 items-center justify-center gap-2 !px-3"
										title="Follow-up"
										aria-label="Follow-up"
										onClick={() => void queueFollowUp()}
										disabled={!canSend}
									>
										<Icon name="arrow-turn-down-left" className="size-4" />
										<span className="hidden sm:inline">Follow-up</span>
									</Button>
								</>
							)}
							<Button
								type="submit"
								variant="primary"
								size="touch"
								className="inline-flex min-w-11 shrink-0 items-center justify-center gap-2 !px-4"
								title={action}
								aria-label={action}
								disabled={!canSend}
							>
								<Icon
									name={app.isAgentActive ? 'cog-8-tooth' : 'paper-airplane'}
									className="size-4"
								/>
								<span className="hidden sm:inline">{action}</span>
							</Button>
						</div>
					</div>
				</form>
			</div>
		</section>
	);
}
