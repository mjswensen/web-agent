import { useEffect, useCallback } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import type { LayoutState } from '$lib/state/app-state';
import { CommandPalette } from './CommandPalette';
import { CompactDialog } from './CompactDialog';
import { Conversation } from './Conversation';
import { Editor } from './Editor';
import { ExtensionDialogHost } from './ExtensionDialogHost';
import { Footer } from './Footer';
import { GitStatusDrawer } from './GitStatusDrawer';
import { MobileActionSheet } from './MobileActionSheet';
import { ModelDialog } from './ModelDialog';
import { QueuePanel } from './QueuePanel';
import { RecoveryPanel } from './RecoveryPanel';
import { SessionDrawer } from './SessionDrawer';
import { SessionTreeDrawer } from './SessionTreeDrawer';
import { ThinkingDialog } from './ThinkingDialog';
import { ToastHost } from './ToastHost';
import { WidgetRegion } from './WidgetRegion';
import { Button } from './core/Button';

export function AppShell() {
	const app = useAppState();
	const client = useWsClient();

	const cwd = typeof app.sessionState?.cwd === 'string' ? app.sessionState.cwd : '';
	const projectName =
		typeof app.sessionState?.projectName === 'string' ? app.sessionState.projectName : undefined;
	const sessionTitle = app.sessionTitle;
	const agentStatus =
		app.connection.status !== 'connected'
			? app.connection.status
			: !app.pi.available
				? 'Agent unavailable'
				: app.isAgentActive
					? 'Agent working'
					: 'Ready';
	const agentStatusClass =
		app.connection.status !== 'connected'
			? 'text-slate-500 dark:text-slate-400'
			: !app.pi.available
				? 'text-rose-600 dark:text-rose-400'
				: app.isAgentActive
					? 'text-amber-600 dark:text-amber-400'
					: 'text-emerald-600 dark:text-emerald-400';

	function openModelDialog() {
		app.setLayout('modelDialogOpen', true);
		void client?.sendCommand('get_available_models');
	}

	function openSessions() {
		app.setLayout('sessionDrawerOpen', true);
		void client?.sendCommand('get_session_list');
	}

	function openTree() {
		app.setLayout('treeDrawerOpen', true);
		void client?.sendCommand('get_tree');
	}

	function openChanges() {
		app.setLayout('gitStatusDrawerOpen', true);
		void client?.sendCommand('get_git_status');
	}

	const closeTopOverlay = useCallback((): boolean => {
		const dialog = app.activeDialog;
		if (dialog) {
			if (!client) return true;
			try {
				client.sendDialogResponse(
					dialog.id,
					dialog.method === 'confirm' ? { confirmed: false } : { cancelled: true }
				);
				app.removeDialog(dialog.id);
			} catch (error) {
				app.setConnectionError(error instanceof Error ? error.message : String(error));
			}
			return true;
		}
		const overlays: Array<keyof LayoutState> = [
			'mobileActionsOpen',
			'treeDrawerOpen',
			'gitStatusDrawerOpen',
			'sessionDrawerOpen',
			'compactDialogOpen',
			'thinkingDialogOpen',
			'modelDialogOpen',
			'commandPaletteOpen'
		];
		const top = overlays.find((key) => app.layout[key] === true);
		if (!top) return false;
		app.setLayout(top, false);
		return true;
	}, [app, client]);

	// Escape key handler and document title
	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && closeTopOverlay()) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		};
		window.addEventListener('keydown', keydown, true);
		return () => window.removeEventListener('keydown', keydown, true);
	}, [closeTopOverlay]);

	useEffect(() => {
		document.title =
			app.extension.title ?? (projectName ? `Web Agent — ${projectName}` : 'Web Agent');
	}, [app.extension.title, projectName]);

	return (
		<div className="flex h-dvh min-h-0 flex-col bg-slate-100/75 font-mono text-slate-900 dark:bg-slate-950/85 dark:text-slate-100">
			<header className="border-b border-slate-300 bg-white/95 px-4 py-2.5 shadow-[0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-md sm:px-6 dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-none">
				<div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-3 sm:gap-4">
						<div
							className="grid size-10 shrink-0 place-items-center border border-slate-900 bg-slate-950 text-xs font-bold tracking-tighter text-white shadow-[3px_3px_0_var(--color-blue-500)] dark:border-slate-500"
							aria-hidden="true"
						>
							&gt;_
						</div>
						<div className="min-w-0">
							<div className="flex min-w-0 items-center gap-2">
								<p className="shrink-0 text-sm font-bold tracking-[-0.04em]">WEB AGENT</p>
								<span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
								<p
									className="hidden max-w-56 min-w-0 truncate text-xs font-semibold text-slate-700 sm:block dark:text-slate-200"
									title={sessionTitle}
								>
									{sessionTitle ?? 'New session'}
								</p>
							</div>
							<p
								className="mt-0.5 max-w-56 truncate text-[10px] text-slate-500 sm:max-w-sm"
								title={cwd || undefined}
							>
								{cwd || 'Waiting for workspace'}
							</p>
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<div className="flex items-center gap-2 lg:border-r lg:border-slate-200 lg:pr-3 dark:lg:border-slate-700">
							<span
								className={`size-2 ${app.connection.status === 'connected' ? 'bg-emerald-500' : app.connection.status === 'connecting' ? 'animate-pulse bg-amber-400' : 'bg-slate-400'}`}
								aria-hidden="true"
							/>
							<span
								className={`sr-only text-[10px] font-bold tracking-wide uppercase lg:not-sr-only ${agentStatusClass}`}
								aria-live="polite"
							>
								{agentStatus}
							</span>
						</div>
						<Button
							variant="secondary"
							size="touch"
							className="px-3 font-semibold sm:hidden"
							onClick={() => app.setLayout('mobileActionsOpen', true)}
						>
							Menu
						</Button>
						<nav
							className="hidden items-center border border-slate-300 bg-slate-50 p-0.5 sm:flex dark:border-slate-700 dark:bg-slate-950"
							aria-label="Agent tools"
						>
							<Button size="toolbar" variant="ghost" onClick={openSessions}>Sessions</Button>
							<Button size="toolbar" variant="ghost" onClick={openTree}>Tree</Button>
							<Button size="toolbar" variant="ghost" onClick={openChanges}>Changes</Button>
							<Button size="toolbar" variant="ghost" onClick={() => app.setLayout('commandPaletteOpen', true)}>Commands</Button>
							<Button size="toolbar" variant="ghost" onClick={openModelDialog}>Model</Button>
							<Button size="toolbar" variant="ghost" onClick={() => app.setLayout('thinkingDialogOpen', true)}>Think</Button>
							<Button size="toolbar" variant="ghost" onClick={() => app.setLayout('compactDialogOpen', true)}>Compact</Button>
						</nav>
					</div>
				</div>
			</header>

			<RecoveryPanel />
			<Conversation />
			<WidgetRegion widgets={app.widgetsAboveEditor} />
			<QueuePanel />
			<Editor />
			<WidgetRegion widgets={app.widgetsBelowEditor} />
			<Footer />

			<CommandPalette />
			<ModelDialog />
			<ThinkingDialog />
			<CompactDialog />
			<ExtensionDialogHost />
			<ToastHost />
			<SessionDrawer />
			<SessionTreeDrawer />
			<GitStatusDrawer />
			<MobileActionSheet />
		</div>
	);
}
