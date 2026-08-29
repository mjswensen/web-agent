/**
 * Client build script using Bun's bundler with Tailwind CSS support.
 */
import tailwind from 'bun-plugin-tailwind';
import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const outdir = join(import.meta.dirname, '..', 'build', 'client');
await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: [join(import.meta.dirname, '..', 'src', 'client', 'main.tsx')],
	outdir,
	minify: true,
	sourcemap: 'none',
	plugins: [tailwind],
	target: 'browser',
	naming: {
		entry: '[name].[hash].[ext]',
		asset: '[name].[hash].[ext]'
	}
});

if (!result.success) {
	console.error('Build failed:');
	for (const message of result.logs) {
		console.error(message);
	}
	process.exit(1);
}

// Generate index.html referencing built assets
const jsEntry = result.outputs.find((o) => o.path.endsWith('.js'));
const cssEntry = result.outputs.find((o) => o.path.endsWith('.css'));

const jsFilename = jsEntry ? jsEntry.path.split('/').pop() : 'main.js';
const cssFilename = cssEntry ? cssEntry.path.split('/').pop() : undefined;

const html = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="text-scale" content="scale" />
		<link rel="icon" href="/web-agent.png" type="image/png" />
		<link rel="apple-touch-icon" href="/web-agent.png" />
		${cssFilename ? `<link rel="stylesheet" href="/${cssFilename}" />` : ''}
	</head>
	<body>
		<div id="app"></div>
		<script type="module" src="/${jsFilename}"></script>
	</body>
</html>
`;

await Bun.write(join(outdir, 'index.html'), html);

// Copy static assets
const staticDir = join(import.meta.dirname, '..', 'static');
try {
	await cp(staticDir, outdir, { recursive: true, force: true });
} catch {
	// static dir may not exist
}

console.log('Client build complete.');
