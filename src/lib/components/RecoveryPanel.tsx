import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';

export function RecoveryPanel() {
	const app = useAppState();
	const client = useWsClient();
	if (app.agent.status === 'ready') return null;
	const unconfigured = app.agent.status === 'unconfigured';
	const modelRequired = app.agent.status === 'model_required';
	return (
		<section className="mx-auto mt-4 w-full max-w-4xl rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
			<h2 className="font-semibold">
				{unconfigured
					? 'Provider setup required'
					: modelRequired
						? 'Model selection required'
						: 'Agent unavailable'}
			</h2>
			<p className="mt-1 leading-6">
				{app.agent.message ??
					(unconfigured
						? 'Set up a provider to continue.'
						: modelRequired
							? 'Choose one of the authenticated models to continue.'
							: 'Your visible conversation is preserved. Restart Web Agent to initialize the embedded runtime again.')}
			</p>
			{(unconfigured || modelRequired) && (
				<div className="mt-3">
					<Button
						variant="primary"
						size="touch"
						onClick={() => {
							const target = modelRequired ? 'modelDialogOpen' : 'providerDialogOpen';
							app.setLayout(target, true);
							void client?.sendCommand(
								modelRequired ? 'get_available_models' : 'get_auth_providers'
							);
						}}
					>
						{modelRequired ? 'Select model' : 'Set up provider'}
					</Button>
				</div>
			)}
		</section>
	);
}
