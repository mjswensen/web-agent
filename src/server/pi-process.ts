import {
	spawn as nodeSpawn,
	type ChildProcessWithoutNullStreams,
	type SpawnOptions
} from 'node:child_process';

export class JsonlParseError extends Error {
	readonly record: string;

	constructor(record: string, cause: unknown) {
		super(
			`Invalid JSONL record from Pi: ${cause instanceof Error ? cause.message : String(cause)}`
		);
		this.name = 'JsonlParseError';
		this.record = record;
	}
}

/**
 * A streaming, LF-only line reader. It deliberately does not use readline:
 * readline recognizes Unicode line separators that are valid characters inside
 * JSON strings, whereas Pi RPC defines records exclusively with LF.
 */
export class StrictLfReader {
	private readonly decoder = new TextDecoder('utf-8');
	private pending = '';
	private finished = false;

	constructor(private readonly onRecord: (record: string) => void) {}

	push(chunk: Uint8Array | string): void {
		if (this.finished) throw new Error('Cannot push data after finishing a JSONL reader.');
		this.pending +=
			typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });
		this.emitCompleteRecords();
	}

	finish(): void {
		if (this.finished) return;
		this.finished = true;
		this.pending += this.decoder.decode();
		this.emitCompleteRecords();

		// A final record without an LF is still useful diagnostics and is accepted
		// by many JSONL producers. Normal Pi RPC writes always include the LF.
		if (this.pending !== '') {
			this.emit(this.pending);
			this.pending = '';
		}
	}

	private emitCompleteRecords(): void {
		let newlineIndex = this.pending.indexOf('\n');
		while (newlineIndex !== -1) {
			const record = this.pending.slice(0, newlineIndex);
			this.pending = this.pending.slice(newlineIndex + 1);
			this.emit(record);
			newlineIndex = this.pending.indexOf('\n');
		}
	}

	private emit(record: string): void {
		this.onRecord(record.endsWith('\r') ? record.slice(0, -1) : record);
	}
}

export class StrictJsonlReader<T = unknown> {
	private readonly lines: StrictLfReader;

	constructor(
		private readonly onRecord: (record: T) => void,
		private readonly onError: (error: JsonlParseError) => void
	) {
		this.lines = new StrictLfReader((line) => {
			if (!line) return;
			try {
				this.onRecord(JSON.parse(line) as T);
			} catch (error) {
				this.onError(new JsonlParseError(line, error));
			}
		});
	}

	push(chunk: Uint8Array | string): void {
		this.lines.push(chunk);
	}

	finish(): void {
		this.lines.finish();
	}
}

export interface PiProcessExit {
	code: number | null;
	signal: NodeJS.Signals | null;
}

export interface PiProcessOptions {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	spawn?: SpawnFunction;
}

export type SpawnFunction = (
	command: string,
	args: readonly string[],
	options: SpawnOptions
) => ChildProcessWithoutNullStreams;

export type PiRecordListener = (record: unknown) => void;
export type PiErrorListener = (error: Error) => void;
export type PiStderrListener = (line: string) => void;
export type PiExitListener = (exit: PiProcessExit) => void;

/** Owns one long-lived Pi RPC subprocess and its strict JSONL transport. */
export class PiProcess {
	private readonly recordListeners = new Set<PiRecordListener>();
	private readonly protocolErrorListeners = new Set<PiErrorListener>();
	private readonly stderrListeners = new Set<PiStderrListener>();
	private readonly exitListeners = new Set<PiExitListener>();
	private readonly stdoutReader: StrictJsonlReader;
	private readonly stderrReader: StrictLfReader;
	private exited = false;
	private exitValue: PiProcessExit | undefined;
	private readonly exitPromise: Promise<PiProcessExit>;
	private resolveExit!: (value: PiProcessExit) => void;

	readonly child: ChildProcessWithoutNullStreams;

	constructor(options: PiProcessOptions) {
		const spawn: SpawnFunction =
			options.spawn ??
			((command, args, spawnOptions) =>
				nodeSpawn(command, [...args], spawnOptions) as ChildProcessWithoutNullStreams);
		this.child = spawn(options.command, options.args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: 'pipe'
		});

		this.exitPromise = new Promise<PiProcessExit>((resolve) => {
			this.resolveExit = resolve;
		});
		this.stdoutReader = new StrictJsonlReader(
			(record) => this.notify(this.recordListeners, record),
			(error) => this.notify(this.protocolErrorListeners, error)
		);
		this.stderrReader = new StrictLfReader((line) => {
			if (line) this.notify(this.stderrListeners, line);
		});

		this.child.stdout.on('data', (chunk: Buffer) => this.stdoutReader.push(chunk));
		this.child.stdout.on('end', () => this.stdoutReader.finish());
		this.child.stderr.on('data', (chunk: Buffer) => this.stderrReader.push(chunk));
		this.child.stderr.on('end', () => this.stderrReader.finish());
		this.child.on('error', (error) => {
			this.notify(this.protocolErrorListeners, error);
			// A failed spawn emits `error` and may never emit `exit`; represent it
			// as an unavailable child so shutdown/recovery code cannot wait forever.
			this.markExited({ code: null, signal: null });
		});
		this.child.once('exit', (code, signal) => this.markExited({ code, signal }));
		this.child.once('close', () => {
			this.stdoutReader.finish();
			this.stderrReader.finish();
		});
	}

	onRecord(listener: PiRecordListener): () => void {
		return this.addListener(this.recordListeners, listener);
	}

	onProtocolError(listener: PiErrorListener): () => void {
		return this.addListener(this.protocolErrorListeners, listener);
	}

	onStderr(listener: PiStderrListener): () => void {
		return this.addListener(this.stderrListeners, listener);
	}

	onExit(listener: PiExitListener): () => void {
		if (this.exitValue) listener(this.exitValue);
		return this.addListener(this.exitListeners, listener);
	}

	/** Serialize exactly one JSON command followed by a single LF and await write completion. */
	send(command: unknown): Promise<void> {
		if (this.exited || this.child.stdin.destroyed || !this.child.stdin.writable) {
			return Promise.reject(new Error('Pi RPC process is not accepting commands.'));
		}

		let record: string;
		try {
			record = `${JSON.stringify(command)}\n`;
		} catch (error) {
			return Promise.reject(error);
		}

		return new Promise<void>((resolve, reject) => {
			this.child.stdin.write(record, (error) => (error ? reject(error) : resolve()));
		});
	}

	waitForExit(): Promise<PiProcessExit> {
		return this.exitPromise;
	}

	/** Close stdin, request graceful termination, then force-kill only after the grace period. */
	async stop(gracePeriodMs = 5_000): Promise<PiProcessExit> {
		if (this.exited) return this.exitValue!;
		if (!Number.isFinite(gracePeriodMs) || gracePeriodMs < 0) {
			throw new RangeError('The Pi shutdown grace period must be a non-negative finite number.');
		}

		this.child.stdin.end();
		try {
			this.child.kill('SIGTERM');
		} catch (error) {
			this.notify(
				this.protocolErrorListeners,
				error instanceof Error ? error : new Error(String(error))
			);
		}

		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<'timeout'>((resolve) => {
			timer = setTimeout(() => resolve('timeout'), gracePeriodMs);
		});
		const result = await Promise.race([this.exitPromise, timeout]);
		if (timer) clearTimeout(timer);
		if (result !== 'timeout') return result;

		try {
			this.child.kill('SIGKILL');
		} catch (error) {
			this.notify(
				this.protocolErrorListeners,
				error instanceof Error ? error : new Error(String(error))
			);
		}
		return this.exitPromise;
	}

	private markExited(exit: PiProcessExit): void {
		if (this.exited) return;
		this.exited = true;
		this.exitValue = exit;
		this.resolveExit(exit);
		this.notify(this.exitListeners, exit);
	}

	private addListener<T>(
		listeners: Set<(value: T) => void>,
		listener: (value: T) => void
	): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	private notify<T>(listeners: Set<(value: T) => void>, value: T): void {
		for (const listener of listeners) listener(value);
	}
}
