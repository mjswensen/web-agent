import { useAppState } from '$lib/state/app-context';

export function QueuePanel() {
	const app = useAppState();
	if (!app.hasQueuedMessages) return null;
	const count = app.queue.steering.length + app.queue.followUp.length;

	return (
		<section
			className="border-t border-slate-200 bg-amber-50 px-4 py-2 sm:px-6 dark:border-amber-900 dark:bg-amber-950"
			aria-label="Queued messages"
		>
			<div className="mx-auto w-full max-w-4xl">
				<button
					type="button"
					className="min-h-11 rounded-md px-2 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-amber-200"
					onClick={() => app.toggleQueue()}
					aria-expanded={app.layout.queueOpen}
				>
					Queue · {count} {count === 1 ? 'message' : 'messages'} ·{' '}
					{app.layout.queueOpen ? 'Hide' : 'Show'}
				</button>
				{app.layout.queueOpen && (
					<div className="grid gap-3 pb-2 text-xs text-amber-950 sm:grid-cols-2 dark:text-amber-100">
						<section>
							<h2 className="font-semibold">Steering</h2>
							<p className="mt-1 text-amber-800 dark:text-amber-300">
								Delivered after the current assistant turn or tool calls.
							</p>
							{app.queue.steering.map((message, index) => (
								<pre
									key={`steering:${index}:${message}`}
									className="font-inherit mt-2 rounded border border-amber-200 bg-white/70 px-2 py-2 break-words whitespace-pre-wrap"
								>
									{message}
								</pre>
							))}
						</section>
						<section>
							<h2 className="font-semibold">Follow-up</h2>
							<p className="mt-1 text-amber-800 dark:text-amber-300">
								Delivered once the agent fully settles.
							</p>
							{app.queue.followUp.map((message, index) => (
								<pre
									key={`follow-up:${index}:${message}`}
									className="font-inherit mt-2 rounded border border-amber-200 bg-white/70 px-2 py-2 break-words whitespace-pre-wrap"
								>
									{message}
								</pre>
							))}
						</section>
					</div>
				)}
			</div>
		</section>
	);
}
