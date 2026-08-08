<script lang="ts">
	import { onMount } from 'svelte';
	import { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import { getAppState } from '$lib/state/app-context.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import CompactDialog from './CompactDialog.svelte';
	import Conversation from './Conversation.svelte';
	import Editor from './Editor.svelte';
	import ExtensionDialogHost from './ExtensionDialogHost.svelte';
	import Footer from './Footer.svelte';
	import GitStatusDrawer from './GitStatusDrawer.svelte';
	import MobileActionSheet from './MobileActionSheet.svelte';
	import ModelDialog from './ModelDialog.svelte';
	import QueuePanel from './QueuePanel.svelte';
	import RecoveryPanel from './RecoveryPanel.svelte';
	import SessionDrawer from './SessionDrawer.svelte';
	import SessionTreeDrawer from './SessionTreeDrawer.svelte';
	import ThinkingDialog from './ThinkingDialog.svelte';
	import ToastHost from './ToastHost.svelte';
	import WidgetRegion from './WidgetRegion.svelte';
	import Button from './core/Button.svelte';

	const app = getAppState();
	let client = $state<WebAgentWebSocketClient | undefined>(undefined);
	let cwd = $derived(typeof app.sessionState?.cwd === 'string' ? app.sessionState.cwd : '');
	let projectName = $derived(
		typeof app.sessionState?.projectName === 'string' ? app.sessionState.projectName : undefined
	);
	let agentStatus = $derived(
		app.connection.status !== 'connected'
			? app.connection.status
			: !app.pi.available
				? 'Agent unavailable'
				: app.isAgentActive
					? 'Agent working'
					: 'Ready'
	);
	let agentStatusClass = $derived(
		app.connection.status !== 'connected'
			? 'text-slate-500 dark:text-slate-400'
			: !app.pi.available
				? 'text-rose-600 dark:text-rose-400'
				: app.isAgentActive
					? 'text-amber-600 dark:text-amber-400'
					: 'text-emerald-600 dark:text-emerald-400'
	);

	function openModelDialog(): void {
		app.layout.modelDialogOpen = true;
		void client?.sendCommand('get_available_models');
	}

	function openSessions(): void {
		app.layout.sessionDrawerOpen = true;
		void client?.sendCommand('get_session_list');
	}

	function openTree(): void {
		app.layout.treeDrawerOpen = true;
		void client?.sendCommand('get_tree');
	}

	function openChanges(): void {
		app.layout.gitStatusDrawerOpen = true;
		void client?.sendCommand('get_git_status');
	}

	function closeTopOverlay(): boolean {
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
		const overlays: Array<keyof typeof app.layout> = [
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
		app.layout[top] = false;
		return true;
	}

	onMount(() => {
		const socket = new WebAgentWebSocketClient({ state: app });
		client = socket;
		socket.connect();
		const keydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && closeTopOverlay()) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		};
		window.addEventListener('keydown', keydown, true);
		return () => {
			window.removeEventListener('keydown', keydown, true);
			socket.disconnect();
		};
	});

	$effect(() => {
		document.title =
			app.extension.title ?? (projectName ? `Web Agent — ${projectName}` : 'Web Agent');
	});
</script>

<div
	class="flex h-dvh min-h-0 flex-col bg-slate-100/75 font-mono text-slate-900 dark:bg-slate-950/85 dark:text-slate-100"
>
	<header
		class="border-b border-slate-300 bg-white/95 px-4 py-2.5 shadow-[0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-md sm:px-6 dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-none"
	>
		<div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
			<div class="flex min-w-0 items-center gap-3 sm:gap-4">
				<div
					class="grid size-10 shrink-0 place-items-center border border-slate-900 bg-slate-950 text-xs font-bold tracking-tighter text-white shadow-[3px_3px_0_var(--color-blue-500)] dark:border-slate-500"
					aria-hidden="true"
				>
					&gt;_
				</div>
				<div class="min-w-0">
					<div class="flex min-w-0 items-center gap-2">
						<p class="shrink-0 text-sm font-bold tracking-[-0.04em]">WEB AGENT</p>
						<span class="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
						<p
							class="hidden max-w-56 truncate text-xs font-semibold text-slate-700 sm:block dark:text-slate-200"
							title={app.sessionName}
						>
							{app.sessionName ?? 'New session'}
						</p>
					</div>
					<p
						class="mt-0.5 max-w-56 truncate text-[10px] text-slate-500 sm:max-w-sm"
						title={cwd || undefined}
					>
						{cwd || 'Waiting for workspace'}
					</p>
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<div
					class="flex items-center gap-2 lg:border-r lg:border-slate-200 lg:pr-3 dark:lg:border-slate-700"
				>
					<span
						class={`size-2 ${app.connection.status === 'connected' ? 'bg-emerald-500' : app.connection.status === 'connecting' ? 'animate-pulse bg-amber-400' : 'bg-slate-400'}`}
						aria-hidden="true"
					></span>
					<span
						class={`sr-only text-[10px] font-bold tracking-wide uppercase lg:not-sr-only ${agentStatusClass}`}
						aria-live="polite"
					>
						{agentStatus}
					</span>
				</div>
				<Button
					variant="secondary"
					size="touch"
					class="px-3 font-semibold sm:hidden"
					onclick={() => (app.layout.mobileActionsOpen = true)}>Menu</Button
				>
				<nav
					class="hidden items-center border border-slate-300 bg-slate-50 p-0.5 sm:flex dark:border-slate-700 dark:bg-slate-950"
					aria-label="Agent tools"
				>
					<Button size="toolbar" variant="ghost" onclick={openSessions}>Sessions</Button>
					<Button size="toolbar" variant="ghost" onclick={openTree}>Tree</Button>
					<Button size="toolbar" variant="ghost" onclick={openChanges}>Changes</Button>
					<Button
						size="toolbar"
						variant="ghost"
						onclick={() => (app.layout.commandPaletteOpen = true)}>Commands</Button
					>
					<Button size="toolbar" variant="ghost" onclick={openModelDialog}>Model</Button>
					<Button
						size="toolbar"
						variant="ghost"
						onclick={() => (app.layout.thinkingDialogOpen = true)}>Think</Button
					>
					<Button
						size="toolbar"
						variant="ghost"
						onclick={() => (app.layout.compactDialogOpen = true)}>Compact</Button
					>
				</nav>
			</div>
		</div>
	</header>

	<RecoveryPanel {app} {client} />
	<Conversation state={app} />
	<WidgetRegion widgets={app.widgetsAboveEditor} />
	<QueuePanel {app} />
	<Editor {app} {client} />
	<WidgetRegion widgets={app.widgetsBelowEditor} />
	<Footer {app} />

	<CommandPalette {app} />
	<ModelDialog {app} {client} />
	<ThinkingDialog {app} {client} />
	<CompactDialog {app} {client} />
	<ExtensionDialogHost {app} {client} />
	<ToastHost {app} />
	<SessionDrawer {app} {client} />
	<SessionTreeDrawer {app} {client} />
	<GitStatusDrawer {app} {client} />
	<MobileActionSheet {app} {client} />
</div>
