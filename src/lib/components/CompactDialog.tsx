import { useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';
import { DialogShell } from './core/DialogShell';
import { Textarea } from './core/Textarea';

export function CompactDialog() {
	const app = useAppState();
	const client = useWsClient();
	const [instructions, setInstructions] = useState('');
	const [compacting, setCompacting] = useState(false);

	async function compact() {
		if (!client) return;
		setCompacting(true);
		try {
			const response = await client.sendCommand(
				'compact',
				instructions.trim() ? { customInstructions: instructions } : {}
			);
			if (response.success) {
				app.setLayout('compactDialogOpen', false);
				setInstructions('');
			} else app.addToast(response.error ?? 'Pi could not compact the session.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setCompacting(false);
		}
	}

	if (!app.layout.compactDialogOpen) return null;

	return (
		<DialogShell maxWidth="lg" ariaLabel="Compact conversation" className="p-5">
			<h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
				Compact conversation
			</h2>
			<p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
				Pi will summarize prior context to make room for the next part of the session.
			</p>
			<label
				className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200"
				htmlFor="compact-instructions"
			>
				Optional instructions
			</label>
			<Textarea
				id="compact-instructions"
				value={instructions}
				onChange={(e) => setInstructions(e.target.value)}
				rows={4}
				placeholder="What should Pi preserve in the summary?"
				className="mt-2 w-full"
			/>
			<div className="mt-4 flex justify-end gap-2">
				<Button variant="muted" size="touch" onClick={() => app.setLayout('compactDialogOpen', false)}>
					Cancel
				</Button>
				<Button variant="primary" size="touch" onClick={() => void compact()} disabled={compacting}>
					{compacting ? 'Compacting…' : 'Compact'}
				</Button>
			</div>
			{app.compaction.message && (
				<p className="mt-3 text-xs text-slate-500">{app.compaction.message}</p>
			)}
		</DialogShell>
	);
}
