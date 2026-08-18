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

export type ProcessEnvironment = Record<string, string | undefined>;

export interface PiProcessExit {
	code: number | null;
	signal: string | number | null;
}

export interface PiWritable {
	write(data: string | Uint8Array): number | Promise<number>;
	flush(): number | Promise<number>;
	end(): number | void | Promise<number | void>;
}

export interface PiSubprocess {
	readonly stdin: PiWritable;
	readonly stdout: ReadableStream<Uint8Array>;
	readonly stderr: ReadableStream<Uint8Array>;
	readonly exited: Promise<number>;
	readonly signalCode: number | null;
	kill(signal?: string | number): void;
}

export interface PiSpawnOptions {
	cmd: string[];
	cwd: string;
	env: ProcessEnvironment;
	stdin: 'pipe';
	stdout: 'pipe';
	stderr: 'pipe';
}

export interface PiProcessOptions {
	command: string;
	args: string[];
	cwd: string;
	env?: ProcessEnvironment;
	spawn?: SpawnFunction;
}

export type SpawnFunction = (options: PiSpawnOptions) => PiSubprocess;

export type PiRecordListener = (record: unknown) => void;
export type PiErrorListener = (error: Error) => void;
export type PiStderrListener = (line: string) => void;
export type PiExitListener = (exit: PiProcessExit) => void;

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/** Owns one long-lived Pi RPC subprocess and its strict Bun stream transport. */
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

	readonly child: PiSubprocess;

	constructor(options: PiProcessOptions) {
		const spawn: SpawnFunction =
			options.spawn ?? ((spawnOptions) => Bun.spawn(spawnOptions) as unknown as PiSubprocess);
		this.child = spawn({
			cmd: [options.command, ...options.args],
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdin: 'pipe',
			stdout: 'pipe',
			stderr: 'pipe'
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

		this.consume(this.child.stdout, this.stdoutReader);
		this.consume(this.child.stderr, this.stderrReader);
		void this.child.exited.then(
			(code) => this.markExited({ code, signal: this.child.signalCode }),
			(error) => {
				this.notify(this.protocolErrorListeners, asError(error));
				this.markExited({ code: null, signal: this.child.signalCode });
			}
		);
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

	/** Serialize exactly one JSON command followed by a single LF and await Bun's flush. */
	async send(command: unknown): Promise<void> {
		if (this.exited) throw new Error('Pi RPC process is not accepting commands.');
		const record = `${JSON.stringify(command)}\n`;
		await this.child.stdin.write(record);
		await this.child.stdin.flush();
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

		try {
			await this.child.stdin.end();
		} catch (error) {
			this.notify(this.protocolErrorListeners, asError(error));
		}
		try {
			this.child.kill('SIGTERM');
		} catch (error) {
			this.notify(this.protocolErrorListeners, asError(error));
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
			this.notify(this.protocolErrorListeners, asError(error));
		}
		return this.exitPromise;
	}

	private consume(
		stream: ReadableStream<Uint8Array>,
		reader: StrictJsonlReader | StrictLfReader
	): void {
		void (async () => {
			const streamReader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await streamReader.read();
					if (done) break;
					reader.push(value);
				}
			} catch (error) {
				this.notify(this.protocolErrorListeners, asError(error));
			} finally {
				reader.finish();
				streamReader.releaseLock();
			}
		})();
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
