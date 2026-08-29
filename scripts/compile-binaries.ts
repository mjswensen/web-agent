const root = `${import.meta.dir}/..`;
const entrypoint = `${root}/build/server/server/entry.js`;
const dist = `${root}/dist`;
const bun = Bun.which('bun');

if (!bun) throw new Error('Could not find the Bun executable.');
if (!(await Bun.file(entrypoint).exists())) {
	throw new Error('Server build not found. Run `bun run build` before compiling binaries.');
}

const binaries = [
	{ target: 'bun-linux-x64', outfile: 'web-agent-linux-x64' },
	{ target: 'bun-darwin-arm64', outfile: 'web-agent-darwin-arm64' }
] as const;

// Bun 1.3.14 bytecode generation cannot handle top-level await in the bundled SDK graph.
for (const binary of binaries) {
	const child = Bun.spawn({
		cmd: [
			bun,
			'build',
			entrypoint,
			'--compile',
			'--minify',
			'--external',
			'@silvia-odwyer/photon-node',
			`--target=${binary.target}`,
			`--outfile=${dist}/${binary.outfile}`
		],
		cwd: root,
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit'
	});

	const exitCode = await child.exited;
	if (exitCode !== 0) {
		throw new Error(`Failed to compile ${binary.target} (exit code ${exitCode}).`);
	}
}
