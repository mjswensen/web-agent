<script lang="ts">
	import type { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import type { AppState, ExtensionDialog } from '$lib/state/app-state.svelte';
	import Button from './core/Button.svelte';
	import DialogShell from './core/DialogShell.svelte';
	import TextField from './core/TextField.svelte';
	import Textarea from './core/Textarea.svelte';

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
	<DialogShell maxWidth="lg" layer="raised" ariaLabel={dialog.title} class="p-5">
		<h2 id={`dialog-${dialog.id}`} class="text-base font-semibold text-slate-900">
			{dialog.title}
		</h2>
		{#if dialog.message}
			<p class="mt-2 text-sm leading-6 text-slate-600">{dialog.message}</p>
		{/if}

		{#if dialog.method === 'select'}
			<div class="mt-4 grid gap-2">
				{#each dialog.options ?? [] as option (option)}
					<Button
						variant="secondary"
						size="touch"
						class="w-full text-left font-normal"
						onclick={() => answer(dialog, { value: option })}>{option}</Button
					>
				{/each}
			</div>
		{:else if dialog.method === 'confirm'}
			<div class="mt-5 flex justify-end gap-2">
				<Button variant="muted" size="touch" onclick={() => answer(dialog, { confirmed: false })}
					>Cancel</Button
				>
				<Button variant="primary" size="touch" onclick={() => answer(dialog, { confirmed: true })}
					>Confirm</Button
				>
			</div>
		{:else}
			<form class="mt-4" onsubmit={(event) => submitValue(event, dialog)}>
				<label class="sr-only" for={`dialog-value-${dialog.id}`}>{dialog.title}</label>
				{#if dialog.method === 'editor'}
					<Textarea
						id={`dialog-value-${dialog.id}`}
						name="value"
						rows={8}
						class="w-full"
						value={dialog.prefill ?? ''}
					/>
				{:else}
					<TextField
						id={`dialog-value-${dialog.id}`}
						name="value"
						value={dialog.prefill ?? ''}
						placeholder={dialog.placeholder ?? ''}
						class="w-full"
					/>
				{/if}
				<div class="mt-4 flex justify-end gap-2">
					<Button variant="muted" size="touch" onclick={() => answer(dialog, { cancelled: true })}
						>Cancel</Button
					>
					<Button type="submit" variant="primary" size="touch">Submit</Button>
				</div>
			</form>
		{/if}
		{#if dialog.method === 'select'}
			<div class="mt-4 flex justify-end">
				<Button variant="muted" size="touch" onclick={() => answer(dialog, { cancelled: true })}
					>Cancel</Button
				>
			</div>
		{/if}
	</DialogShell>
{/if}
