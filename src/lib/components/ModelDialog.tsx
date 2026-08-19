import { useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';
import { DialogHeader } from './core/DialogHeader';
import { DialogShell } from './core/DialogShell';

export function ModelDialog() {
	const app = useAppState();
	const client = useWsClient();
	const [selecting, setSelecting] = useState<string | undefined>(undefined);

	const groups: [string, Record<string, unknown>[]][] = (() => {
		const grouped: Record<string, Record<string, unknown>[]> = {};
		for (const model of app.models) {
			const provider = typeof model.provider === 'string' ? model.provider : 'Other';
			(grouped[provider] ??= []).push(model);
		}
		return Object.entries(grouped);
	})();

	async function refresh() {
		try {
			const response = await client?.sendCommand('get_available_models');
			if (response && !response.success)
				app.addToast(response.error ?? 'Unable to load models.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	async function choose(model: Record<string, unknown>) {
		if (!client || typeof model.provider !== 'string' || typeof model.id !== 'string') return;
		const key = `${model.provider}/${model.id}`;
		setSelecting(key);
		try {
			const response = await client.sendCommand('set_model', {
				provider: model.provider,
				modelId: model.id
			});
			if (response.success) {
				app.setLayout('modelDialogOpen', false);
				await client.sendCommand('get_state');
			} else app.addToast(response.error ?? 'Pi rejected the model.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setSelecting(undefined);
		}
	}

	if (!app.layout.modelDialogOpen) return null;

	return (
		<DialogShell maxWidth="2xl" ariaLabel="Model selection">
			<DialogHeader
				title="Select model"
				description="The active model changes for every connected tab."
				actions={
					<>
						<Button
							variant="ghost"
							size="sm"
							className="font-semibold text-blue-700 hover:bg-blue-50"
							onClick={() => void refresh()}
						>
							Refresh
						</Button>
						<Button variant="muted" size="sm" onClick={() => app.setLayout('modelDialogOpen', false)}>
							Close
						</Button>
					</>
				}
			/>
			<div className="max-h-[65vh] overflow-y-auto p-3">
				{groups.length === 0 && (
					<p className="px-2 py-8 text-center text-sm text-slate-500">
						No models loaded yet. Select Refresh to fetch them.
					</p>
				)}
				{groups.map(([provider, models]) => (
					<section key={provider} className="mb-4">
						<h3 className="px-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
							{provider}
						</h3>
						<div className="mt-2 grid gap-1">
							{models.map((model) => (
								<button
									key={typeof model.id === 'string' ? model.id : JSON.stringify(model)}
									type="button"
									className="flex min-h-12 items-center justify-between rounded-lg px-3 text-left hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-slate-800"
									onClick={() => void choose(model)}
									disabled={selecting !== undefined}
								>
									<span className="text-sm font-medium text-slate-800 dark:text-slate-100">
										{typeof model.name === 'string'
											? model.name
											: typeof model.id === 'string'
												? model.id
												: 'Model'}
									</span>
									<span className="ml-4 text-xs text-slate-500 dark:text-slate-400">
										{selecting === `${model.provider}/${model.id}` ? 'Selecting…' : model.id as string}
									</span>
								</button>
							))}
						</div>
					</section>
				))}
			</div>
		</DialogShell>
	);
}
