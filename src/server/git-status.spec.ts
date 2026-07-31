import { describe, expect, it } from 'vitest';
import {
	DefaultGitStatusProvider,
	parsePorcelainV2,
	type GitCommand,
	type GitCommandResult,
	type GitCommandRunner
} from './git-status.js';

const result = (stdout = '', code = 0): GitCommandResult => ({
	code,
	stdout: Buffer.from(stdout),
	stderr: Buffer.alloc(0)
});

class FakeRunner implements GitCommandRunner {
	readonly commands: GitCommand[] = [];
	constructor(private readonly responses: GitCommandResult[]) {}
	async run(command: GitCommand): Promise<GitCommandResult> {
		this.commands.push(command);
		const response = this.responses.shift();
		if (!response) throw new Error(`Unexpected Git command: ${command.args.join(' ')}`);
		return response;
	}
}

const status = (...records: string[]) => `${records.join('\0')}\0`;

describe('Git status provider', () => {
	it('parses staged, unstaged, renamed, conflicted, and escaped paths from NUL porcelain', () => {
		const parsed = parsePorcelainV2(
			Buffer.from(
				status(
					'# branch.oid abcdef0123456789',
					'# branch.head main',
					'1 M. N... 100644 100644 100644 a b src/staged.ts',
					'1 .M N... 100644 100644 100644 a b src/unstaged.ts',
					'2 R. N... 100644 100644 100644 a b c R100 renamed.ts',
					'original name.ts',
					'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
					'? leading - and\nnewline.txt',
					'! ignored.txt'
				)
			)
		);
		expect(parsed.branch).toEqual({ name: 'main', detached: false, oid: 'abcdef0123456789' });
		expect(parsed.files.map((file) => file.path)).toEqual([
			'src/staged.ts',
			'src/unstaged.ts',
			'renamed.ts',
			'conflict.ts',
			'leading - and\\nnewline.txt'
		]);
		expect(parsed.files[2]).toMatchObject({ originalPath: 'original name.ts', indexStatus: 'R' });
		expect(parsed.files[3]).toMatchObject({ conflicted: true, indexStatus: 'U' });
	});

	it('handles a clean unborn worktree without requesting diffs', async () => {
		const runner = new FakeRunner([
			result('/repo\n'),
			result(status('# branch.oid (initial)', '# branch.head main'))
		]);
		const provider = new DefaultGitStatusProvider({ cwd: '/launch', runner });
		await expect(provider.getStatus()).resolves.toEqual({
			state: 'ready',
			repositoryRoot: '/repo',
			branch: { name: 'main', detached: false },
			refreshedAt: expect.any(String),
			files: []
		});
		expect(runner.commands).toHaveLength(2);
		expect(runner.commands[0].args).toEqual(['-C', '/launch', 'rev-parse', '--show-toplevel']);
		expect(runner.commands[1].args).toContain('--porcelain=v2');
	});

	it('creates staged, unstaged, and required untracked previews using status-derived paths', async () => {
		const runner = new FakeRunner([
			result('/repo\n'),
			result(
				status(
					'# branch.oid deadbeef',
					'# branch.head (detached)',
					'1 MM N... 100644 100644 100644 a b mixed.ts',
					'? z untracked.txt',
					'? a untracked.txt'
				)
			),
			result('staged mixed'),
			result('unstaged mixed'),
			result('untracked z', 1),
			result('untracked a', 1)
		]);
		const provider = new DefaultGitStatusProvider({ cwd: '/launch', runner, concurrency: 1 });
		const snapshot = await provider.getStatus();
		expect(snapshot).toMatchObject({
			state: 'ready',
			branch: { name: 'Detached HEAD', detached: true, oid: 'deadbeef' }
		});
		if (snapshot.state !== 'ready') throw new Error('Expected ready status.');
		expect(snapshot.files.map((file) => file.path)).toEqual([
			'a untracked.txt',
			'mixed.ts',
			'z untracked.txt'
		]);
		expect(snapshot.files.find((file) => file.path === 'mixed.ts')).toMatchObject({
			stagedDiff: 'staged mixed',
			unstagedDiff: 'unstaged mixed'
		});
		expect(snapshot.files.find((file) => file.path === 'a untracked.txt')).toMatchObject({
			untracked: true,
			unstagedDiff: 'untracked a'
		});
		const stagedCommand = runner.commands.find((command) => command.args.includes('--cached'));
		expect(stagedCommand?.args).toEqual([
			'-C',
			'/repo',
			'diff',
			'--cached',
			'--no-ext-diff',
			'--no-color',
			'--binary',
			'--',
			'mixed.ts'
		]);
		const untrackedCommand = runner.commands.find((command) =>
			command.args.includes('z untracked.txt')
		);
		expect(untrackedCommand?.args).toEqual([
			'-C',
			'/repo',
			'diff',
			'--no-index',
			'--no-ext-diff',
			'--no-color',
			'--binary',
			'--',
			'/dev/null',
			'z untracked.txt'
		]);
	});

	it('uses actual preview bytes rather than reserving the per-diff limit for every file', async () => {
		const runner = new FakeRunner([
			result('/repo\n'),
			result(
				status(
					'# branch.oid deadbeef',
					'# branch.head main',
					'1 .M N... 1 1 1 a b first.ts',
					'1 .M N... 1 1 1 a b second.ts'
				)
			),
			result('+a'),
			result('+b')
		]);
		const provider = new DefaultGitStatusProvider({
			cwd: '/launch',
			runner,
			concurrency: 1,
			maxTotalDiffBytes: 4
		});
		const snapshot = await provider.getStatus();
		if (snapshot.state !== 'ready') throw new Error('Expected ready status.');
		expect(snapshot.files).toMatchObject([
			{ path: 'first.ts', unstagedDiff: '+a' },
			{ path: 'second.ts', unstagedDiff: '+b' }
		]);
		expect(snapshot.files.some((file) => file.unstagedDiffTruncated)).toBe(false);
	});

	it('retains a partial preview and opaque token only when a diff exceeds its preview limit', async () => {
		const runner = new FakeRunner([
			result('/repo\n'),
			result(status('# branch.oid deadbeef', '# branch.head main', '1 .M N... 1 1 1 a b file.ts')),
			{ ...result('+partial preview'), code: null, outputLimited: true }
		]);
		const provider = new DefaultGitStatusProvider({ cwd: '/launch', runner, concurrency: 1 });
		const snapshot = await provider.getStatus();
		if (snapshot.state !== 'ready') throw new Error('Expected ready status.');
		expect(snapshot.files[0]).toMatchObject({
			path: 'file.ts',
			unstagedDiff: '+partial preview',
			unstagedDiffTruncated: true,
			unstagedDiffToken: expect.any(String)
		});
		expect(provider.hasDiff(snapshot.files[0].unstagedDiffToken!)).toBe(true);
	});

	it('returns distinct non-repository and safe error states', async () => {
		const notRepo = new FakeRunner([
			{ ...result('', 128), stderr: Buffer.from('fatal: not a git repository') }
		]);
		await expect(
			new DefaultGitStatusProvider({ cwd: '/outside', runner: notRepo }).getStatus()
		).resolves.toMatchObject({
			state: 'not_repository'
		});
		const limited = new FakeRunner([{ ...result('/repo\n'), outputLimited: true }]);
		await expect(
			new DefaultGitStatusProvider({ cwd: '/launch', runner: limited }).getStatus()
		).resolves.toMatchObject({
			state: 'error',
			message: expect.stringContaining('limit')
		});
	});
});
