import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { SessionTreeNode } from './SessionTreeNode';
import { Button } from './core/Button';
import { DialogHeader } from './core/DialogHeader';
import { DialogShell } from './core/DialogShell';

export function SessionTreeDrawer() {
	const app = useAppState();
	const client = useWsClient();

	async function clone() {
		if (!client) return;
		try {
			const response = await client.sendCommand('clone');
			if (!response.success)
				app.addToast(response.error ?? 'Unable to clone the active branch.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	if (!app.layout.treeDrawerOpen) return null;

	return (
		<DialogShell kind="drawer" maxWidth="xl" ariaLabel="Session tree">
			<DialogHeader
				title="Session tree"
				description="Browse branches. Continue-in-place is not available over Pi RPC."
				actions={
					<Button variant="muted" size="sm" onClick={() => app.setLayout('treeDrawerOpen', false)}>
						Close
					</Button>
				}
			/>
			<div className="border-b border-slate-200 p-3">
				<Button variant="secondary" size="touch" onClick={() => void clone()}>
					Clone active branch
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-3">
				{app.tree.length === 0 && (
					<p className="px-2 py-8 text-center text-sm text-slate-500">No tree data loaded yet.</p>
				)}
				{app.tree.map((node) => {
					const entry =
						typeof node.entry === 'object' && node.entry !== null && !Array.isArray(node.entry)
							? (node.entry as Record<string, unknown>)
							: {};
					return (
						<SessionTreeNode
							key={typeof entry.id === 'string' ? entry.id : JSON.stringify(node)}
							node={node}
							depth={0}
							app={app}
							client={client}
						/>
					);
				})}
			</div>
		</DialogShell>
	);
}
