import { useEffect, useRef, useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import type { JsonObject, JsonValue } from '$lib/client/protocol';
import { Button } from './core/Button';
import { DialogHeader } from './core/DialogHeader';
import { DialogShell } from './core/DialogShell';
import { TextField } from './core/TextField';

function object(value: JsonValue | undefined): JsonObject | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function objects(value: JsonValue | undefined): JsonObject[] {
	return Array.isArray(value)
		? value.filter((item): item is JsonObject => object(item) !== undefined)
		: [];
}

function text(value: JsonValue | undefined): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export function ProviderDialog() {
	const app = useAppState();
	const client = useWsClient();
	const [value, setValue] = useState('');
	const [busy, setBusy] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const prompt = app.authFlow?.prompt;
	const promptId = text(prompt?.promptId);

	useEffect(() => {
		setValue('');
		if (promptId) requestAnimationFrame(() => input.current?.focus());
	}, [promptId]);

	async function refresh() {
		try {
			const response = await client?.sendCommand('get_auth_providers');
			if (response && !response.success)
				app.addToast(response.error ?? 'Unable to load providers.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	async function start(providerId: string, authType: string) {
		if (!client || (authType !== 'oauth' && authType !== 'api_key')) return;
		app.clearAuthFlow();
		setBusy(true);
		try {
			const response = await client.sendCommand('start_auth', { providerId, authType });
			const data = object(response.data);
			if (response.success && typeof data?.flowId === 'string') app.beginAuthFlow(data.flowId);
			else app.addToast(response.error ?? 'Authentication could not start.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function submitPrompt(selectedValue = value) {
		if (!client || !app.authFlow || !promptId || selectedValue.length === 0) return;
		setBusy(true);
		try {
			const response = await client.sendCommand('submit_auth_prompt', {
				flowId: app.authFlow.id,
				promptId,
				value: selectedValue
			});
			setValue('');
			if (!response.success)
				app.addToast(response.error ?? 'The provider rejected that response.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function cancel() {
		if (!client || !app.authFlow) return;
		const response = await client.sendCommand('cancel_auth', { flowId: app.authFlow.id });
		if (!response.success)
			app.addToast(response.error ?? 'Unable to cancel authentication.', 'error');
	}

	async function logout(providerId: string) {
		if (!client) return;
		setBusy(true);
		try {
			const response = await client.sendCommand('logout_provider', { providerId });
			app.addToast(
				response.success ? 'Removed the stored credential.' : (response.error ?? 'Logout failed.'),
				response.success ? 'info' : 'error'
			);
		} finally {
			setBusy(false);
		}
	}

	function openModels() {
		app.setLayout('providerDialogOpen', false);
		app.setLayout('modelDialogOpen', true);
		void client?.sendCommand('get_available_models');
	}

	if (!app.layout.providerDialogOpen) return null;

	const flow = app.authFlow;
	return (
		<DialogShell maxWidth="2xl" ariaLabel="Provider authentication">
			<DialogHeader
				title="Providers"
				description="Credentials are stored by Pi on this machine and shared with its CLI."
				actions={
					<Button
						variant="muted"
						size="sm"
						onClick={() => app.setLayout('providerDialogOpen', false)}
					>
						Close
					</Button>
				}
			/>

			<div className="max-h-[72vh] overflow-y-auto p-4">
				{!app.webAuthEnabled && (
					<div className="mb-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
						{app.webAuthDisabledReason}
					</div>
				)}

				{flow ? (
					<section aria-live="polite">
						<div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
							<p className="text-xs font-bold tracking-[0.12em] text-blue-700 uppercase dark:text-blue-300">
								Authentication in progress
							</p>
							{flow.status === 'active' && (
								<Button variant="muted" size="sm" onClick={() => void cancel()}>
									Cancel
								</Button>
							)}
						</div>

						<div className="grid gap-3">
							{flow.notices.map((notice, index) => {
								const type = text(notice.type);
								const url = text(notice.url) ?? text(notice.verificationUri);
								const code = text(notice.userCode);
								const links = objects(notice.links);
								return (
									<div
										key={`${type}-${index}`}
										className="border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
									>
										<p>{text(notice.message) ?? text(notice.instructions)}</p>
										{code && (
											<div className="mt-3 flex items-center gap-2">
												<code className="border border-blue-300 bg-white px-3 py-2 text-lg font-bold tracking-[0.18em] text-blue-800 dark:bg-slate-900 dark:text-blue-200">
													{code}
												</code>
												<Button
													variant="secondary"
													size="touch"
													onClick={() => {
														void navigator.clipboard.writeText(code);
														app.addToast('Device code copied.');
													}}
												>
													Copy code
												</Button>
											</div>
										)}
										{url && (
											<a
												className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue-700 underline decoration-2 underline-offset-4 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-blue-300"
												href={url}
												target="_blank"
												rel="noopener noreferrer"
											>
												Open provider sign-in
											</a>
										)}
										{links.map((link) => (
											<a
												key={text(link.url)}
												className="mt-2 block text-blue-700 underline focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-blue-300"
												href={text(link.url)}
												target="_blank"
												rel="noopener noreferrer"
											>
												{text(link.label) ?? text(link.url)}
											</a>
										))}
									</div>
								);
							})}
						</div>

						{prompt && (
							<form
								className="mt-4 border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950"
								onSubmit={(event) => {
									event.preventDefault();
									void submitPrompt();
								}}
							>
								<label className="block text-sm font-semibold" htmlFor="auth-response">
									{text(prompt.message) ?? 'Provider response'}
								</label>
								{prompt.promptType === 'select' ? (
									<div className="mt-3 grid gap-2">
										{objects(prompt.options).map((option) => (
											<Button
												key={text(option.id)}
												type="button"
												variant="secondary"
												size="touch"
												className="h-auto min-h-11 justify-start py-2 text-left"
												disabled={busy}
												onClick={() => void submitPrompt(text(option.id) ?? '')}
											>
												<span>
													<span className="block font-semibold">{text(option.label)}</span>
													{text(option.description) && (
														<span className="mt-0.5 block text-xs font-normal text-slate-500">
															{text(option.description)}
														</span>
													)}
												</span>
											</Button>
										))}
									</div>
								) : (
									<div className="mt-2 flex flex-col gap-2 sm:flex-row">
										<TextField
											ref={input}
											id="auth-response"
											type={prompt.promptType === 'secret' ? 'password' : 'text'}
											autoComplete="off"
											placeholder={text(prompt.placeholder)}
											value={value}
											onChange={(event) => setValue(event.target.value)}
											className="min-w-0 flex-1"
										/>
										<Button type="submit" variant="primary" size="touch" disabled={!value || busy}>
											Continue
										</Button>
									</div>
								)}
							</form>
						)}

						{flow.status !== 'active' && (
							<div className="mt-4 border border-slate-300 p-4 dark:border-slate-700">
								<p
									className={
										flow.status === 'complete'
											? 'text-emerald-700 dark:text-emerald-300'
											: 'text-rose-700 dark:text-rose-300'
									}
								>
									{flow.message}
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{flow.status === 'complete' && (
										<Button variant="primary" size="touch" onClick={openModels}>
											Select model
										</Button>
									)}
									<Button variant="secondary" size="touch" onClick={() => app.clearAuthFlow()}>
										Back to providers
									</Button>
								</div>
							</div>
						)}
					</section>
				) : (
					<section>
						<div className="mb-3 flex items-center justify-between gap-3">
							<p className="text-xs text-slate-500">Only stored credentials can be removed here.</p>
							<Button variant="ghost" size="sm" onClick={() => void refresh()}>
								Refresh
							</Button>
						</div>
						<div className="grid gap-2">
							{app.authProviders.map((provider) => {
								const providerId = text(provider.id) ?? '';
								return (
									<article
										key={providerId}
										className="border border-slate-200 p-3 dark:border-slate-700"
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<h3 className="text-sm font-bold">{text(provider.name) ?? providerId}</h3>
												<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
													{provider.configured === true
														? `Configured${text(provider.source) ? ` · ${text(provider.source)}` : ''}`
														: 'Not configured'}
												</p>
											</div>
											<span
												className={`mt-1 size-2 shrink-0 ${provider.configured === true ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
												aria-hidden="true"
											/>
										</div>
										<div className="mt-3 flex flex-wrap gap-2">
											{objects(provider.methods).map((method) => (
												<Button
													key={text(method.type)}
													variant="secondary"
													size="touch"
													disabled={busy || !app.webAuthEnabled || method.interactive !== true}
													title={method.interactive === true ? undefined : text(method.name)}
													onClick={() => void start(providerId, text(method.type) ?? '')}
												>
													{text(method.label) ?? text(method.name)}
												</Button>
											))}
											{provider.stored === true && (
												<Button
													variant="danger"
													size="touch"
													disabled={busy || !app.webAuthEnabled}
													onClick={() => void logout(providerId)}
												>
													Remove saved credential
												</Button>
											)}
										</div>
									</article>
								);
							})}
							{app.authProviders.length === 0 && (
								<p className="py-8 text-center text-sm text-slate-500">
									No providers are available.
								</p>
							)}
						</div>
					</section>
				)}
			</div>
		</DialogShell>
	);
}
