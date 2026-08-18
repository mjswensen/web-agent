import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import type { LayoutState } from '$lib/state/app-state';
import { Button } from './core/Button';

export function MobileActionSheet() {
	const app = useAppState();
	const client = useWsClient();

	function open(target: keyof LayoutState) {
		app.setLayout('mobileActionsOpen', false);
		app.setLayout(target, true);
		if (target === 'sessionDrawerOpen') void client?.sendCommand('get_session_list');
		if (target === 'treeDrawerOpen') void client?.sendCommand('get_tree');
		if (target === 'gitStatusDrawerOpen') void client?.sendCommand('get_git_status');
		if (target === 'modelDialogOpen') void client?.sendCommand('get_available_models');
	}

	if (!app.layout.mobileActionsOpen) return null;

	return (
		<div
			className="fixed inset-0 z-30 bg-slate-950/30 sm:hidden"
			role="presentation"
			onClick={(event) => {
				if (event.target === event.currentTarget) app.setLayout('mobileActionsOpen', false);
			}}
		>
			<div className="absolute right-3 bottom-3 left-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
				<div className="grid grid-cols-2 gap-2 text-sm">
					<Button variant="secondary" size="touch" className="text-slate-800" onClick={() => open('sessionDrawerOpen')}>Sessions</Button>
					<Button variant="secondary" size="touch" className="text-slate-800" onClick={() => open('treeDrawerOpen')}>Tree</Button>
					<Button variant="secondary" size="touch" className="text-slate-800" onClick={() => open('gitStatusDrawerOpen')}>Changes</Button>
					<Button variant="secondary" size="touch" className="text-slate-800" onClick={() => open('modelDialogOpen')}>Model</Button>
					<Button variant="secondary" size="touch" className="text-slate-800" onClick={() => open('thinkingDialogOpen')}>Thinking</Button>
					<Button variant="secondary" size="touch" className="text-slate-800" onClick={() => open('compactDialogOpen')}>Compact</Button>
					<Button variant="secondary" size="touch" className="text-slate-800" onClick={() => open('commandPaletteOpen')}>Commands</Button>
				</div>
			</div>
		</div>
	);
}
