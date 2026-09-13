import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import type { LayoutState } from '$lib/state/app-state';
import { Button } from './core/Button';
import { Icon } from './Icon';

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
		if (target === 'providerDialogOpen') void client?.sendCommand('get_auth_providers');
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
				<div className="grid grid-cols-2 gap-2 text-sm [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center">
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('sessionDrawerOpen')}
					>
						<Icon
							name="history"
							className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
						/>
						Sessions
					</Button>
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('treeDrawerOpen')}
					>
						<Icon name="tree" className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500" />
						Tree
					</Button>
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('gitStatusDrawerOpen')}
					>
						<Icon
							name="changes"
							className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
						/>
						Changes
					</Button>
					{app.terminalEnabled && (
						<Button
							variant="secondary"
							size="touch"
							className="text-slate-800"
							onClick={() => open('terminalDrawerOpen')}
						>
							<Icon
								name="terminal"
								className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
							/>
							Terminal
						</Button>
					)}
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('providerDialogOpen')}
					>
						<Icon
							name="providers"
							className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
						/>
						Providers
					</Button>
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('modelDialogOpen')}
					>
						<Icon
							name="model"
							className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
						/>
						Model
					</Button>
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('thinkingDialogOpen')}
					>
						<Icon
							name="thinking"
							className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
						/>
						Thinking
					</Button>
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('compactDialogOpen')}
					>
						<Icon
							name="compact"
							className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
						/>
						Compact
					</Button>
					<Button
						variant="secondary"
						size="touch"
						className="text-slate-800"
						onClick={() => open('commandPaletteOpen')}
					>
						<Icon
							name="commands"
							className="mr-2 size-4 shrink-0 text-slate-400 dark:text-slate-500"
						/>
						Commands
					</Button>
				</div>
			</div>
		</div>
	);
}
