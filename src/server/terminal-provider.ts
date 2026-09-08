export interface TerminalCallbacks {
	onData(data: Uint8Array): void;
	onExit(exitCode: number | null, signal: string | null): void;
}

export interface TerminalOpenOptions {
	cols: number;
	rows: number;
	callbacks: TerminalCallbacks;
}

export interface TerminalOpenResult {
	pid: number;
	shell: string;
	reused: boolean;
}

export interface TerminalProvider {
	open(clientId: string, options: TerminalOpenOptions): TerminalOpenResult;
	write(clientId: string, data: string): void;
	resize(clientId: string, cols: number, rows: number): void;
	kill(clientId: string): boolean;
	disconnect(clientId: string): void;
	dispose(): void;
}

interface TerminalSession {
	terminal: Bun.Terminal;
	process?: Bun.Subprocess;
	callbacks: TerminalCallbacks;
	shell: string;
	pending: Uint8Array[];
	pendingBytes: number;
	droppedOutput: boolean;
	flushTimer?: ReturnType<typeof setTimeout>;
	disconnectTimer?: ReturnType<typeof setTimeout>;
}

const OUTPUT_BATCH_MS = 16;
const MAX_PENDING_OUTPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_FRAME_BYTES = 64 * 1024;
const DISCONNECT_GRACE_MS = 10_000;
const OUTPUT_DROPPED_NOTICE = new TextEncoder().encode(
	'\r\n\x1b[33m[Web Agent dropped terminal output to protect performance.]\x1b[0m\r\n'
);

function shellName(shell: string): string {
	return shell.split(/[\\/]/).pop() || shell;
}

/** Owns one Bun PTY per browser connection and no agent-runtime state. */
export class BunTerminalProvider implements TerminalProvider {
	private readonly sessions = new Map<string, TerminalSession>();

	constructor(
		private readonly cwd: string,
		private readonly disconnectGraceMs = DISCONNECT_GRACE_MS
	) {}

	open(clientId: string, options: TerminalOpenOptions): TerminalOpenResult {
		const existing = this.sessions.get(clientId);
		if (existing) {
			if (existing.disconnectTimer) clearTimeout(existing.disconnectTimer);
			existing.disconnectTimer = undefined;
			existing.callbacks = options.callbacks;
			existing.terminal.resize(options.cols, options.rows);
			if (!existing.process) throw new Error('Terminal is still starting.');
			return { pid: existing.process.pid, shell: shellName(existing.shell), reused: true };
		}

		const shell = process.env.SHELL || '/bin/sh';
		const terminal = new Bun.Terminal({
			cols: options.cols,
			rows: options.rows,
			name: 'xterm-256color',
			data: (_terminal, data) => {
				const current = this.sessions.get(clientId);
				if (current) this.queueOutput(current, data);
			}
		});
		const session: TerminalSession = {
			terminal,
			callbacks: options.callbacks,
			shell,
			pending: [],
			pendingBytes: 0,
			droppedOutput: false
		};
		this.sessions.set(clientId, session);
		try {
			const child = Bun.spawn([shell, '-i'], {
				cwd: this.cwd,
				env: process.env,
				terminal,
				onExit: (_process, exitCode, signalCode) => {
					const current = this.sessions.get(clientId);
					if (!current || current.terminal !== terminal) return;
					this.flushOutput(current);
					this.sessions.delete(clientId);
					terminal.close();
					current.callbacks.onExit(exitCode, signalCode === null ? null : String(signalCode));
				}
			});
			session.process = child;
			return { pid: child.pid, shell: shellName(shell), reused: false };
		} catch (error) {
			this.sessions.delete(clientId);
			terminal.close();
			throw error;
		}
	}

	write(clientId: string, data: string): void {
		const session = this.requiredSession(clientId);
		if (data.length > 64 * 1024) throw new Error('Terminal input is too large.');
		session.terminal.write(data);
	}

	resize(clientId: string, cols: number, rows: number): void {
		this.requiredSession(clientId).terminal.resize(cols, rows);
	}

	kill(clientId: string): boolean {
		const session = this.sessions.get(clientId);
		if (!session) return false;
		this.sessions.delete(clientId);
		if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
		if (session.flushTimer) clearTimeout(session.flushTimer);
		session.process?.kill();
		session.terminal.close();
		return true;
	}

	disconnect(clientId: string): void {
		const session = this.sessions.get(clientId);
		if (!session || session.disconnectTimer) return;
		session.disconnectTimer = setTimeout(() => this.kill(clientId), this.disconnectGraceMs);
	}

	dispose(): void {
		for (const clientId of [...this.sessions.keys()]) this.kill(clientId);
	}

	private requiredSession(clientId: string): TerminalSession {
		const session = this.sessions.get(clientId);
		if (!session) throw new Error('No terminal is running. Open the terminal first.');
		return session;
	}

	private queueOutput(session: TerminalSession, data: Uint8Array): void {
		if (session.pendingBytes + data.byteLength <= MAX_PENDING_OUTPUT_BYTES) {
			session.pending.push(data.slice());
			session.pendingBytes += data.byteLength;
		} else {
			session.droppedOutput = true;
		}
		if (!session.flushTimer) {
			session.flushTimer = setTimeout(() => this.flushOutput(session), OUTPUT_BATCH_MS);
		}
	}

	private flushOutput(session: TerminalSession): void {
		if (session.flushTimer) clearTimeout(session.flushTimer);
		session.flushTimer = undefined;
		const total = session.pendingBytes + (session.droppedOutput ? OUTPUT_DROPPED_NOTICE.length : 0);
		if (total === 0) return;
		const output = new Uint8Array(total);
		let offset = 0;
		for (const chunk of session.pending) {
			output.set(chunk, offset);
			offset += chunk.byteLength;
		}
		if (session.droppedOutput) output.set(OUTPUT_DROPPED_NOTICE, offset);
		session.pending = [];
		session.pendingBytes = 0;
		session.droppedOutput = false;
		for (let start = 0; start < output.byteLength; start += MAX_OUTPUT_FRAME_BYTES) {
			session.callbacks.onData(output.slice(start, start + MAX_OUTPUT_FRAME_BYTES));
		}
	}
}
