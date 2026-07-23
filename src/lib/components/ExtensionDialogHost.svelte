<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState, ExtensionDialog } from '$lib/state/app-state.svelte';

	let { app, client }: { app: AppState; client: WebAgentWebSocketClient | undefined } = $props();
	let dialog = $derived(app.activeDialog);

	function answer(
		dialog: ExtensionDialog,
		response: { value?: string; confirmed?: boolean; cancelled?: true }
	): void {
		try {
			client?.sendDialogResponse(dialog.id, response);
			app.removeDialog(dialog.id);
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	function submitValue(event: SubmitEvent, dialog: ExtensionDialog): void {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const value = new FormData(form).get('value');
		answer(dialog, { value: typeof value === 'string' ? value : '' });
	}
</script>

{#if dialog}
	<div
		class="fixed inset-0 z-40 grid place-items-end bg-slate-950/30 p-3 sm:place-items-center"
		role="presentation"
	>
		<div
			class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby={`dialog-${dialog.id}`}
		>
			<h2 id={`dialog-${dialog.id}`} class="text-base font-semibold text-slate-900">
				{dialog.title}
			</h2>
			{#if dialog.message}
				<p class="mt-2 text-sm leading-6 text-slate-600">{dialog.message}</p>
			{/if}

			{#if dialog.method === 'select'}
				<div class="mt-4 grid gap-2">
					{#each dialog.options ?? [] as option (option)}
						<button
							type="button"
							class="min-h-11 rounded-lg border border-slate-300 px-3 text-left text-sm text-slate-800 hover:border-blue-400 hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							onclick={() => answer(dialog, { value: option })}>{option}</button
						>
					{/each}
				</div>
			{:else if dialog.method === 'confirm'}
				<div class="mt-5 flex justify-end gap-2">
					<button
						type="button"
						class="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
						onclick={() => answer(dialog, { confirmed: false })}>Cancel</button
					>
					<button
						type="button"
						class="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
						onclick={() => answer(dialog, { confirmed: true })}>Confirm</button
					>
				</div>
			{:else}
				<form class="mt-4" onsubmit={(event) => submitValue(event, dialog)}>
					<label class="sr-only" for={`dialog-value-${dialog.id}`}>{dialog.title}</label>
					{#if dialog.method === 'editor'}
						<textarea
							id={`dialog-value-${dialog.id}`}
							name="value"
							rows="8"
							class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
							>{dialog.prefill ?? ''}</textarea
						>
					{:else}
						<input
							id={`dialog-value-${dialog.id}`}
							name="value"
							value={dialog.prefill ?? ''}
							placeholder={dialog.placeholder ?? ''}
							class="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
						/>
					{/if}
					<div class="mt-4 flex justify-end gap-2">
						<button
							type="button"
							class="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
							onclick={() => answer(dialog, { cancelled: true })}>Cancel</button
						>
						<button
							type="submit"
							class="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
							>Submit</button
						>
					</div>
				</form>
			{/if}
			{#if dialog.method === 'select'}
				<div class="mt-4 flex justify-end">
					<button
						type="button"
						class="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none"
						onclick={() => answer(dialog, { cancelled: true })}>Cancel</button
					>
				</div>
			{/if}
		</div>
	</div>
{/if}
