import { useEffect, useRef, useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';
import { DialogShell } from './core/DialogShell';
import { Textarea } from './core/Textarea';

export function McpDialog() {
	const app = useAppState();
	const client = useWsClient();
	const [text, setText] = useState('');
	const [revision, setRevision] = useState('');
	const [busy, setBusy] = useState(true);
	const [error, setError] = useState('');
	const [status, setStatus] = useState('');
	const [checking, setChecking] = useState(false);
	const closeButton = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeButton.current?.focus();
		let active = true;
		if (!client) {
			setError('Connect to Web Agent to configure MCP servers.');
			setBusy(false);
			return;
		}
		void client
			.sendCommand('get_mcp_config')
			.then((response) => {
				if (!active) return;
				const data = response.data;
				if (
					response.success &&
					data &&
					typeof data === 'object' &&
					!Array.isArray(data) &&
					typeof data.text === 'string' &&
					typeof data.revision === 'string'
				) {
					setText(data.text);
					setRevision(data.revision);
				} else setError(response.error ?? 'Cannot load MCP configuration.');
			})
			.catch(() => {
				if (active) setError('Cannot load MCP configuration.');
			})
			.finally(() => {
				if (active) setBusy(false);
			});
		return () => {
			active = false;
		};
	}, [client]);

	async function checkStatus() {
		if (!client) return;
		setChecking(true);
		try {
			const response = await client.sendCommand('get_mcp_status');
			const data = response.data;
			if (
				response.success &&
				data &&
				typeof data === 'object' &&
				!Array.isArray(data) &&
				typeof data.status === 'string'
			)
				setStatus(data.status);
			else setError(response.error ?? 'Cannot inspect MCP connections.');
		} catch {
			setError('Cannot inspect MCP connections.');
		} finally {
			setChecking(false);
		}
	}

	async function save() {
		if (!client) return;
		try {
			JSON.parse(text);
		} catch {
			setError('Enter valid JSON before saving.');
			return;
		}
		setBusy(true);
		setError('');
		try {
			const response = await client.sendCommand('set_mcp_config', { text, revision });
			if (response.success) {
				app.addToast('MCP configuration saved and reloaded.');
				app.setLayout('mcpDialogOpen', false);
			} else setError(response.error ?? 'Cannot save MCP configuration.');
		} catch {
			setError('Connection lost. Reopen the dialog to check whether configuration was saved.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<DialogShell
			maxWidth="2xl"
			ariaLabel="MCP servers"
			className="max-h-[90dvh] overflow-y-auto p-5"
		>
			<h2 className="text-base font-semibold">MCP servers</h2>
			<p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
				Edit user-level ~/.pi/agent/mcp.json. Trusted project .pi/mcp.json entries take precedence.
				Saving reconnects servers without replacing the conversation.
			</p>
			<p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
				Only configure servers you trust: stdio commands run locally and HTTP servers receive tool
				data. Use ${'{TOKEN}'} environment references instead of pasting secrets.
			</p>
			<label htmlFor="mcp-config" className="mt-4 block text-sm font-semibold">
				Server configuration (JSON)
			</label>
			<Textarea
				id="mcp-config"
				value={text}
				onChange={(event) => setText(event.target.value)}
				rows={12}
				disabled={busy || !revision}
				spellCheck={false}
				aria-describedby="mcp-help mcp-error"
				className="mt-2 w-full"
			/>
			<p id="mcp-help" className="mt-2 text-xs text-slate-500 dark:text-slate-400">
				Example: {'{"mcpServers":{"docs":{"url":"https://example.com/mcp","exposure":"direct"}}}'}
				<br />
				Stdio uses command, args and env. Exposure: codemode (default), deferred, direct or hidden.
				Set enabled to false to disable a server; remove its entry to delete it. For connection
				diagnostics, run pi mcp list externally. For OAuth, use pi mcp login &lt;server&gt;
				externally, then save to reconnect.
			</p>
			<Button
				size="touch"
				variant="secondary"
				disabled={checking || busy || !revision}
				onClick={() => void checkStatus()}
			>
				{checking ? 'Checking connections…' : 'Check connections'}
			</Button>
			{status && (
				<pre className="mt-2 max-h-40 overflow-auto text-xs whitespace-pre-wrap" aria-live="polite">
					{status}
				</pre>
			)}
			<p id="mcp-error" role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
				{error}
			</p>
			<div className="mt-4 flex justify-end gap-2">
				<button
					ref={closeButton}
					className="min-h-11 min-w-11 px-4 text-sm focus-visible:outline-2 focus-visible:outline-blue-500"
					onClick={() => app.setLayout('mcpDialogOpen', false)}
				>
					Close
				</button>
				<Button
					variant="primary"
					size="touch"
					disabled={busy || !revision || app.isAgentActive || app.connection.status !== 'connected'}
					onClick={() => void save()}
				>
					{busy ? 'Working…' : 'Save & reconnect'}
				</Button>
			</div>
		</DialogShell>
	);
}
