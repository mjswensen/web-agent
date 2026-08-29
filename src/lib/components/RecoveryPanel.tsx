import { useAppState } from '$lib/state/app-context';

export function RecoveryPanel() {
	const app = useAppState();
	if (app.agent.status === 'ready') return null;
	const unconfigured = app.agent.status === 'unconfigured';
	return (
		<section className="mx-auto mt-4 w-full max-w-4xl rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
			<h2 className="font-semibold">
				{unconfigured ? 'Provider setup required' : 'Agent unavailable'}
			</h2>
			<p className="mt-1 leading-6">
				{app.agent.message ??
					(unconfigured
						? 'Add provider credentials using environment variables or the existing ~/.pi/agent/auth.json, then restart Web Agent.'
						: 'Your visible conversation is preserved. Restart Web Agent to initialize the embedded runtime again.')}
			</p>
		</section>
	);
}
