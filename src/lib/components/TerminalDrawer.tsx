import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { useWsClient } from '$lib/client/use-ws-client';
import { Button } from './core/Button';

function decodeBase64(value: string): Uint8Array {
	const binary = window.atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

export function TerminalDrawer() {
	const app = useAppState();
	const client = useWsClient();
	const rootRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | undefined>(undefined);
	const fitRef = useRef<FitAddon | undefined>(undefined);
	const clientRef = useRef(client);
	const [status, setStatus] = useState('Idle');
	clientRef.current = client;

	useEffect(() => {
		if (!app.terminalEnabled || !rootRef.current) return;
		const terminal = new Terminal({
			cursorBlink: true,
			fontFamily:
				"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
			fontSize: 13,
			lineHeight: 1.2,
			scrollback: 5000,
			theme: {
				background: '#020617',
				foreground: '#e2e8f0',
				cursor: '#60a5fa',
				selectionBackground: '#1e40af'
			}
		});
		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(rootRef.current);
		terminalRef.current = terminal;
		fitRef.current = fit;

		const input = terminal.onData((data) => {
			void clientRef.current
				?.sendCommand('terminal_input', { data })
				.then((response) => {
					if (!response.success) setStatus(response.error ?? 'Input failed');
				})
				.catch(() => setStatus('Disconnected'));
		});
		const terminalEvents = app.subscribeTerminal((frame) => {
			if (frame.kind === 'terminal_output') {
				terminal.write(decodeBase64(frame.data));
				return;
			}
			if (frame.status === 'running') {
				setStatus(`${frame.shell ?? 'Shell'} · PID ${frame.pid ?? '—'}`);
			} else if (frame.status === 'exited') {
				setStatus(`Exited${frame.exitCode === null ? '' : ` (${frame.exitCode})`}`);
				terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
			} else if (frame.status === 'terminated') {
				setStatus('Terminated');
				terminal.write('\r\n\x1b[90m[Terminal terminated]\x1b[0m\r\n');
			} else {
				setStatus(frame.message ?? 'Terminal error');
			}
		});
		const observer = new ResizeObserver(() => {
			if (!app.layout.terminalDrawerOpen) return;
			fit.fit();
			void clientRef.current
				?.sendCommand('terminal_resize', { cols: terminal.cols, rows: terminal.rows })
				.catch(() => undefined);
		});
		observer.observe(rootRef.current);

		return () => {
			observer.disconnect();
			terminalEvents();
			input.dispose();
			terminal.dispose();
			terminalRef.current = undefined;
			fitRef.current = undefined;
		};
	}, [app, app.terminalEnabled]);

	useEffect(() => {
		if (
			!app.terminalEnabled ||
			!app.layout.terminalDrawerOpen ||
			app.connection.status !== 'connected'
		)
			return;
		const frame = requestAnimationFrame(() => {
			const terminal = terminalRef.current;
			if (!terminal) return;
			fitRef.current?.fit();
			setStatus('Starting…');
			void client
				?.sendCommand('terminal_open', { cols: terminal.cols, rows: terminal.rows })
				.then((response) => {
					if (!response.success) setStatus(response.error ?? 'Unable to start terminal');
				})
				.catch((error: unknown) =>
					setStatus(error instanceof Error ? error.message : 'Unable to start terminal')
				);
			terminal.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [app.connection.status, app.layout.terminalDrawerOpen, app.terminalEnabled, client]);

	if (!app.terminalEnabled) return null;
	const open = app.layout.terminalDrawerOpen;

	async function terminate() {
		if (!client) return;
		try {
			const response = await client.sendCommand('terminal_kill');
			if (!response.success) setStatus(response.error ?? 'Unable to terminate terminal');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to terminate terminal');
		}
	}

	return (
		<div
			className={
				open ? 'fixed inset-0 z-30 bg-slate-950/60 p-2 backdrop-blur-[2px] sm:p-4' : 'hidden'
			}
			role="presentation"
		>
			<section
				className="flex h-full min-h-0 w-full flex-col overflow-hidden border border-slate-600 bg-slate-950 shadow-2xl"
				role="dialog"
				aria-modal="true"
				aria-label="Terminal"
			>
				<header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 sm:px-4">
					<div className="min-w-0">
						<h2 className="text-sm font-bold text-slate-100">Terminal</h2>
						<p className="truncate text-[11px] text-slate-400" aria-live="polite">
							{status}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button variant="danger" size="touch" onClick={() => void terminate()}>
							Terminate
						</Button>
						<Button
							variant="muted"
							size="touch"
							onClick={() => app.setLayout('terminalDrawerOpen', false)}
						>
							Close
						</Button>
					</div>
				</header>
				<div className="min-h-0 flex-1 bg-slate-950 p-2 sm:p-3">
					<div ref={rootRef} className="h-full w-full" aria-label="Interactive terminal" />
				</div>
			</section>
		</div>
	);
}
