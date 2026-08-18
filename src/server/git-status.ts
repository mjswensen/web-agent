export interface GitFileStatus {
	path: string;
	originalPath?: string;
	indexStatus?: string;
	worktreeStatus?: string;
	stagedDiff?: string;
	unstagedDiff?: string;
	stagedDiffError?: string;
	unstagedDiffError?: string;
	stagedDiffToken?: string;
	unstagedDiffToken?: string;
	stagedDiffTruncated?: boolean;
	unstagedDiffTruncated?: boolean;
	untracked?: boolean;
	conflicted?: boolean;
	binary?: boolean;
}

export type GitStatusSnapshot =
	| {
			state: 'ready';
			repositoryRoot: string;
			branch: { name: string; detached: boolean; oid?: string };
			refreshedAt: string;
			files: GitFileStatus[];
	  }
	| { state: 'not_repository'; refreshedAt: string }
	| { state: 'error'; refreshedAt: string; message: string };

export interface GitCommand {
	args: readonly string[];
	input?: Buffer;
	timeoutMs?: number;
	maxOutputBytes?: number;
}

export interface GitCommandResult {
	code: number | null;
	stdout: Buffer;
	stderr: Buffer;
	timedOut?: boolean;
	outputLimited?: boolean;
}

export interface GitCommandRunner {
	run(command: GitCommand): Promise<GitCommandResult>;
}

export interface GitStatusProvider {
	getStatus(): Promise<GitStatusSnapshot>;
	hasDiff?(token: string): boolean;
	streamDiff?(token: string, onChunk: (chunk: string) => void): Promise<void>;
}

export interface GitStatusProviderOptions {
	cwd: string;
	runner?: GitCommandRunner;
	timeoutMs?: number;
	maxOutputBytes?: number;
	maxDiffBytes?: number;
	maxTotalDiffBytes?: number;
	concurrency?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_DIFF_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOTAL_DIFF_BYTES = 8 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const FULL_DIFF_TIMEOUT_MS = 120_000;
const DIFF_TOKEN_TTL_MS = 5 * 60_000;

async function readStream(
	stream: ReadableStream<Uint8Array>,
	onChunk: (chunk: Uint8Array) => void
): Promise<void> {
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return;
			onChunk(value);
		}
	} finally {
		reader.releaseLock();
	}
}

/** Runs only fixed Git argument arrays through Bun.spawn and never invokes a shell. */
export class SpawnGitCommandRunner implements GitCommandRunner {
	async run(command: GitCommand): Promise<GitCommandResult> {
		const maxOutputBytes = command.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
		const timeoutMs = command.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const child = Bun.spawn({
			cmd: ['git', ...command.args],
			stdin: command.input ?? 'ignore',
			stdout: 'pipe',
			stderr: 'pipe',
			env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' }
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let outputBytes = 0;
		let timedOut = false;
		let outputLimited = false;
		const append = (target: Buffer[], chunk: Uint8Array) => {
			const allowed = Math.max(0, maxOutputBytes - outputBytes);
			const accepted = chunk.subarray(0, allowed);
			outputBytes += accepted.length;
			if (accepted.length > 0) target.push(Buffer.from(accepted));
			if (accepted.length !== chunk.length && !outputLimited) {
				outputLimited = true;
				child.kill('SIGTERM');
			}
		};
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGTERM');
		}, timeoutMs);
		try {
			await Promise.all([
				child.exited,
				readStream(child.stdout, (chunk) => append(stdoutChunks, chunk)),
				readStream(child.stderr, (chunk) => append(stderrChunks, chunk))
			]);
			return {
				code: child.exitCode,
				stdout: Buffer.concat(stdoutChunks),
				stderr: Buffer.concat(stderrChunks),
				timedOut,
				outputLimited
			};
		} finally {
			clearTimeout(timer);
		}
	}
}

type ParsedFile = GitFileStatus & { pathBytes: Buffer };
type DiffRequest = { args: string[]; acceptDifference: boolean; expiresAt: number };

function displayPath(path: Buffer): string {
	try {
		return new TextDecoder('utf-8', { fatal: true })
			.decode(path)
			.replaceAll('\\', '\\\\')
			.replaceAll('\n', '\\n')
			.replaceAll('\r', '\\r')
			.replaceAll('\t', '\\t');
	} catch {
		let result = '';
		for (const byte of path) {
			if (byte === 0x2f || (byte >= 0x20 && byte <= 0x7e && byte !== 0x5c)) {
				result += String.fromCharCode(byte);
			} else if (byte === 0x5c) result += '\\\\';
			else if (byte === 0x0a) result += '\\n';
			else if (byte === 0x0d) result += '\\r';
			else if (byte === 0x09) result += '\\t';
			else result += `\\x${byte.toString(16).padStart(2, '0')}`;
		}
		return result;
	}
}

function afterSpaces(record: Buffer, count: number): Buffer | undefined {
	let spaces = 0;
	for (let index = 0; index < record.length; index += 1) {
		if (record[index] === 0x20 && ++spaces === count) return record.subarray(index + 1);
	}
	return undefined;
}

function fields(record: Buffer, count: number): string[] {
	return record.toString('ascii').split(' ').slice(0, count);
}

/** Parses porcelain-v2 `--branch -z` output without losing unusual path delimiters. */
export function parsePorcelainV2(output: Buffer): {
	branch: { name: string; detached: boolean; oid?: string };
	files: ParsedFile[];
} {
	const records = output
		.toString('latin1')
		.split('\0')
		.map((record) => Buffer.from(record, 'latin1'));
	let oid: string | undefined;
	let head: string | undefined;
	const files: ParsedFile[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record || record.length === 0) continue;
		const first = String.fromCharCode(record[0]);
		if (first === '#') {
			const header = record.toString('utf8');
			if (header.startsWith('# branch.oid ')) {
				const value = header.slice('# branch.oid '.length);
				if (value !== '(initial)') oid = value;
			}
			if (header.startsWith('# branch.head ')) head = header.slice('# branch.head '.length);
			continue;
		}
		if (first === '!') continue;
		if (first === '?') {
			const pathBytes = record.subarray(2);
			files.push({ path: displayPath(pathBytes), pathBytes, untracked: true, worktreeStatus: '?' });
			continue;
		}
		if (first === '1') {
			const values = fields(record, 3);
			const pathBytes = afterSpaces(record, 8);
			if (!pathBytes) continue;
			files.push({
				path: displayPath(pathBytes),
				pathBytes,
				...(values[1]?.[0] !== '.' ? { indexStatus: values[1]?.[0] } : {}),
				...(values[1]?.[1] !== '.' ? { worktreeStatus: values[1]?.[1] } : {})
			});
			continue;
		}
		if (first === '2') {
			const values = fields(record, 3);
			const pathBytes = afterSpaces(record, 10);
			const originalBytes = records[++index];
			if (!pathBytes || !originalBytes) continue;
			files.push({
				path: displayPath(pathBytes),
				originalPath: displayPath(originalBytes),
				pathBytes,
				...(values[1]?.[0] !== '.' ? { indexStatus: values[1]?.[0] } : {}),
				...(values[1]?.[1] !== '.' ? { worktreeStatus: values[1]?.[1] } : {})
			});
			continue;
		}
		if (first === 'u') {
			const values = fields(record, 3);
			const pathBytes = afterSpaces(record, 10);
			if (!pathBytes) continue;
			files.push({
				path: displayPath(pathBytes),
				pathBytes,
				indexStatus: values[1]?.[0],
				worktreeStatus: values[1]?.[1],
				conflicted: true
			});
		}
	}
	const detached = head === '(detached)';
	return {
		branch: {
			name: detached ? 'Detached HEAD' : head && head !== '(initial)' ? head : 'Unborn branch',
			detached,
			...(oid ? { oid } : {})
		},
		files
	};
}

function commandFailure(result: GitCommandResult): string | undefined {
	if (result.timedOut) return 'Git diff timed out before its preview could be loaded.';
	if (result.outputLimited) return 'Git diff exceeded the preview size limit.';
	if (result.code !== 0) return 'Git could not load this diff preview.';
	return undefined;
}

function isBinary(diff: string): boolean {
	return diff.includes('GIT binary patch') || diff.includes('Binary files ');
}

async function eachConcurrent<T>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<void>
): Promise<void> {
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) await task(items[next++]);
		})
	);
}

/** Read-only, allowlisted view of the launch worktree. */
export class DefaultGitStatusProvider implements GitStatusProvider {
	private readonly runner: GitCommandRunner;
	private readonly timeoutMs: number;
	private readonly maxOutputBytes: number;
	private readonly maxDiffBytes: number;
	private readonly maxTotalDiffBytes: number;
	private readonly concurrency: number;
	private readonly diffRequests = new Map<string, DiffRequest>();

	constructor(private readonly options: GitStatusProviderOptions) {
		this.runner = options.runner ?? new SpawnGitCommandRunner();
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
		this.maxDiffBytes = options.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
		this.maxTotalDiffBytes = options.maxTotalDiffBytes ?? DEFAULT_MAX_TOTAL_DIFF_BYTES;
		this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	}

	async getStatus(): Promise<GitStatusSnapshot> {
		this.discardExpiredDiffRequests();
		const refreshedAt = new Date().toISOString();
		let root: GitCommandResult;
		try {
			root = await this.run(['-C', this.options.cwd, 'rev-parse', '--show-toplevel']);
		} catch {
			return { state: 'error', refreshedAt, message: 'Git could not be started.' };
		}
		if (root.code !== 0) {
			if (root.stderr.toString('utf8').includes('not a git repository')) {
				return { state: 'not_repository', refreshedAt };
			}
			return { state: 'error', refreshedAt, message: 'Git could not resolve the repository.' };
		}
		if (root.timedOut || root.outputLimited) {
			return { state: 'error', refreshedAt, message: 'Git repository lookup exceeded its limit.' };
		}
		const repositoryRoot = root.stdout.toString('utf8').trim();
		if (!repositoryRoot)
			return { state: 'error', refreshedAt, message: 'Git returned no repository root.' };

		let status: GitCommandResult;
		try {
			status = await this.run([
				'-C',
				repositoryRoot,
				'status',
				'--porcelain=v2',
				'--branch',
				'-z',
				'--untracked-files=all'
			]);
		} catch {
			return { state: 'error', refreshedAt, message: 'Git could not read worktree status.' };
		}
		if (commandFailure(status)) {
			return { state: 'error', refreshedAt, message: 'Git could not read worktree status.' };
		}
		const parsed = parsePorcelainV2(status.stdout);
		const diffBudget = { used: 0, limit: this.maxTotalDiffBytes };
		await eachConcurrent(parsed.files, this.concurrency, async (file) =>
			this.loadDiffs(repositoryRoot, file, diffBudget)
		);
		const files = parsed.files
			.map((file) => {
				const publicFile: Partial<ParsedFile> = { ...file };
				delete publicFile.pathBytes;
				return publicFile as GitFileStatus;
			})
			.sort((first, second) => (first.path < second.path ? -1 : first.path > second.path ? 1 : 0));
		return { state: 'ready', repositoryRoot, branch: parsed.branch, refreshedAt, files };
	}

	private run(args: string[]): Promise<GitCommandResult> {
		return this.runner.run({
			args,
			timeoutMs: this.timeoutMs,
			maxOutputBytes: this.maxOutputBytes
		});
	}

	private async loadDiffs(
		repositoryRoot: string,
		file: ParsedFile,
		diffBudget: { used: number; limit: number }
	): Promise<void> {
		const load = async (kind: 'staged' | 'unstaged', args: string[], acceptDifference = false) => {
			const token = this.registerDiff(args, acceptDifference);
			const markTruncated = (message?: string, diff?: string) => {
				if (kind === 'staged') {
					file.stagedDiffToken = token;
					file.stagedDiffTruncated = true;
					if (message) file.stagedDiffError = message;
					if (diff !== undefined) file.stagedDiff = diff;
				} else {
					file.unstagedDiffToken = token;
					file.unstagedDiffTruncated = true;
					if (message) file.unstagedDiffError = message;
					if (diff !== undefined) file.unstagedDiff = diff;
				}
			};
			try {
				const result = await this.runner.run({
					args,
					timeoutMs: this.timeoutMs,
					maxOutputBytes: this.maxDiffBytes
				});
				if (diffBudget.used + result.stdout.length > diffBudget.limit) {
					markTruncated('Git preview omitted because the total preview size limit was reached.');
					return;
				}
				diffBudget.used += result.stdout.length;
				if (result.outputLimited) {
					markTruncated(undefined, result.stdout.toString('utf8'));
					return;
				}
				const failure =
					acceptDifference && result.code === 1 && !result.timedOut
						? undefined
						: commandFailure(result);
				if (failure) {
					if (kind === 'staged') file.stagedDiffError = failure;
					else file.unstagedDiffError = failure;
					return;
				}
				const diff = result.stdout.toString('utf8');
				if (kind === 'staged') file.stagedDiff = diff;
				else file.unstagedDiff = diff;
				if (isBinary(diff)) file.binary = true;
			} catch {
				if (kind === 'staged') file.stagedDiffError = 'Git could not load this diff preview.';
				else file.unstagedDiffError = 'Git could not load this diff preview.';
			}
		};
		if (file.untracked) {
			await load(
				'unstaged',
				[
					'-C',
					repositoryRoot,
					'diff',
					'--no-index',
					'--no-ext-diff',
					'--no-color',
					'--binary',
					'--',
					'/dev/null',
					file.pathBytes.toString('utf8')
				],
				true
			);
			return;
		}
		const tasks: Promise<void>[] = [];
		const path = file.pathBytes.toString('utf8');
		if (file.indexStatus) {
			tasks.push(
				load('staged', [
					'-C',
					repositoryRoot,
					'diff',
					'--cached',
					'--no-ext-diff',
					'--no-color',
					'--binary',
					'--',
					path
				])
			);
		}
		if (file.worktreeStatus) {
			tasks.push(
				load('unstaged', [
					'-C',
					repositoryRoot,
					'diff',
					'--no-ext-diff',
					'--no-color',
					'--binary',
					'--',
					path
				])
			);
		}
		await Promise.all(tasks);
	}

	hasDiff(token: string): boolean {
		this.discardExpiredDiffRequests();
		return this.diffRequests.has(token);
	}

	async streamDiff(token: string, onChunk: (chunk: string) => void): Promise<void> {
		this.discardExpiredDiffRequests();
		const request = this.diffRequests.get(token);
		if (!request) throw new Error('This diff preview has expired. Refresh Changes and try again.');
		const child = Bun.spawn({
			cmd: ['git', ...request.args],
			stdin: 'ignore',
			stdout: 'pipe',
			stderr: 'ignore',
			env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' }
		});
		const decoder = new TextDecoder('utf-8');
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGTERM');
		}, FULL_DIFF_TIMEOUT_MS);
		try {
			await Promise.all([
				child.exited,
				readStream(child.stdout, (chunk) => {
					const text = decoder.decode(chunk, { stream: true });
					if (text) onChunk(text);
				})
			]);
			const trailing = decoder.decode();
			if (trailing) onChunk(trailing);
			if (timedOut) throw new Error('Git timed out while loading the full diff.');
			if (child.exitCode !== 0 && !(request.acceptDifference && child.exitCode === 1)) {
				throw new Error('Git could not load the full diff.');
			}
		} finally {
			clearTimeout(timer);
		}
	}

	private registerDiff(args: string[], acceptDifference: boolean): string {
		const token = crypto.randomUUID();
		this.diffRequests.set(token, {
			args,
			acceptDifference,
			expiresAt: Date.now() + DIFF_TOKEN_TTL_MS
		});
		return token;
	}

	private discardExpiredDiffRequests(): void {
		const now = Date.now();
		for (const [token, request] of this.diffRequests) {
			if (request.expiresAt < now) this.diffRequests.delete(token);
		}
	}
}
