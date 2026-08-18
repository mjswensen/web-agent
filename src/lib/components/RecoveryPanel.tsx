import { useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';

export function RecoveryPanel() {
	const app = useAppState();
	const client = useWsClient();
	const [restarting, setRestarting] = useState(false);

	if (app.pi.available) return null;

	async function restart() {
		if (!client) return;
		setRestarting(true);
		try {
			const response = await client.sendCommand('restart_pi');
			if (!response.success) app.addToast(response.error ?? 'Pi could not be restarted.', 'error');
		} catch (error) {
			app.addToast(error instanceof Error ? error.message : String(error), 'error');
		} finally {
			setRestarting(false);
		}
	}

	return (
		<section className="mx-auto mt-4 w-full max-w-4xl rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
			<h2 className="font-semibold">Pi is unavailable</h2>
			<p className="mt-1 leading-6">
				{app.pi.message ??
					'The Pi child process stopped. Your visible conversation has been preserved.'}
			</p>
			<Button
				variant="danger"
				size="touch"
				className="mt-3"
				onClick={() => void restart()}
				disabled={restarting || app.connection.status !== 'connected'}
			>
				{restarting ? 'Restarting Pi…' : 'Restart Pi'}
			</Button>
		</section>
	);
}
