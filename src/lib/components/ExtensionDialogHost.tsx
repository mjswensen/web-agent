import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import type { ExtensionDialog } from '$lib/state/app-state';
import { Button } from './core/Button';
import { DialogShell } from './core/DialogShell';
import { TextField } from './core/TextField';
import { Textarea } from './core/Textarea';

export function ExtensionDialogHost() {
	const app = useAppState();
	const client = useWsClient();
	const dialog = app.activeDialog;

	if (!dialog) return null;

	function answer(
		dialog: ExtensionDialog,
		response: { value?: string; confirmed?: boolean; cancelled?: true }
	) {
		try {
			client?.sendDialogResponse(dialog.id, response);
			app.removeDialog(dialog.id);
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	function submitValue(event: React.FormEvent<HTMLFormElement>, dialog: ExtensionDialog) {
		event.preventDefault();
		const form = event.currentTarget;
		const value = new FormData(form).get('value');
		answer(dialog, { value: typeof value === 'string' ? value : '' });
	}

	return (
		<DialogShell maxWidth="lg" layer="raised" ariaLabel={dialog.title} className="p-5">
			<h2
				id={`dialog-${dialog.id}`}
				className="text-base font-semibold text-slate-900 dark:text-slate-100"
			>
				{dialog.title}
			</h2>
			{dialog.message && (
				<p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
					{dialog.message}
				</p>
			)}

			{dialog.method === 'select' && (
				<>
					<div className="mt-4 grid gap-2">
						{(dialog.options ?? []).map((option) => (
							<Button
								key={option}
								variant="secondary"
								size="touch"
								className="w-full text-left font-normal"
								onClick={() => answer(dialog, { value: option })}
							>
								{option}
							</Button>
						))}
					</div>
					<div className="mt-4 flex justify-end">
						<Button variant="muted" size="touch" onClick={() => answer(dialog, { cancelled: true })}>
							Cancel
						</Button>
					</div>
				</>
			)}

			{dialog.method === 'confirm' && (
				<div className="mt-5 flex justify-end gap-2">
					<Button variant="muted" size="touch" onClick={() => answer(dialog, { confirmed: false })}>
						Cancel
					</Button>
					<Button variant="primary" size="touch" onClick={() => answer(dialog, { confirmed: true })}>
						Confirm
					</Button>
				</div>
			)}

			{(dialog.method === 'input' || dialog.method === 'editor') && (
				<form className="mt-4" onSubmit={(event) => submitValue(event, dialog)}>
					<label className="sr-only" htmlFor={`dialog-value-${dialog.id}`}>
						{dialog.title}
					</label>
					{dialog.method === 'editor' ? (
						<Textarea
							id={`dialog-value-${dialog.id}`}
							name="value"
							rows={8}
							className="w-full"
							defaultValue={dialog.prefill ?? ''}
						/>
					) : (
						<TextField
							id={`dialog-value-${dialog.id}`}
							name="value"
							defaultValue={dialog.prefill ?? ''}
							placeholder={dialog.placeholder ?? ''}
							className="w-full"
						/>
					)}
					<div className="mt-4 flex justify-end gap-2">
						<Button
							variant="muted"
							size="touch"
							onClick={() => answer(dialog, { cancelled: true })}
						>
							Cancel
						</Button>
						<Button type="submit" variant="primary" size="touch">
							Submit
						</Button>
					</div>
				</form>
			)}
		</DialogShell>
	);
}
