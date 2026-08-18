import { useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';
import { DialogHeader } from './core/DialogHeader';
import { DialogShell } from './core/DialogShell';

const defaultLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export function ThinkingDialog() {
	const app = useAppState();
	const client = useWsClient();
	const [selecting, setSelecting] = useState<string | undefined>(undefined);

	const levels = (() => {
		const model = app.sessionState?.model;
		const map =
			model && typeof model === 'object' && !Array.isArray(model)
				? (model as Record<string, unknown>).thinkingLevelMap
				: undefined;
		if (!map || typeof map !== 'object' || Array.isArray(map)) return defaultLevels;
		const supported = defaultLevels.filter(
			(level) => (map as Record<string, unknown>)[level] !== null
		);
		return supported.length > 0 ? supported : defaultLevels;
	})();

	async function choose(level: string) {
		if (!client) return;
		setSelecting(level);
		try {
			const response = await client.sendCommand('set_thinking_level', { level });
			if (response.success) {
				app.setLayout('thinkingDialogOpen', false);
				await client.sendCommand('get_state');
			} else app.addToast(response.error ?? 'Pi rejected that thinking level.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setSelecting(undefined);
		}
	}

	if (!app.layout.thinkingDialogOpen) return null;

	return (
		<DialogShell maxWidth="md" ariaLabel="Thinking level">
			<DialogHeader
				title="Thinking level"
				description="Pi may reject levels unsupported by the active model."
				actions={
					<Button variant="muted" size="sm" onClick={() => app.setLayout('thinkingDialogOpen', false)}>
						Close
					</Button>
				}
			/>
			<div className="grid gap-1 p-3">
				{levels.map((level) => (
					<button
						key={level}
						type="button"
						className={`min-h-11 rounded-lg px-3 text-left text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${app.footer.thinking === level ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-800 hover:bg-slate-100'}`}
						onClick={() => void choose(level)}
						disabled={selecting !== undefined}
					>
						{selecting === level ? 'Applying…' : level}
					</button>
				))}
			</div>
		</DialogShell>
	);
}
