import { existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES: Record<string, string> = {
	'.css': 'text/css;charset=utf-8',
	'.gif': 'image/gif',
	'.html': 'text/html;charset=utf-8',
	'.ico': 'image/x-icon',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.js': 'text/javascript;charset=utf-8',
	'.json': 'application/json;charset=utf-8',
	'.map': 'application/json;charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain;charset=utf-8',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2'
};

const NO_STORE = { 'cache-control': 'no-store' } as const;

export function contentType(path: string): string {
	const dot = path.lastIndexOf('.');
	if (dot < 0) return 'application/octet-stream';
	return MIME_TYPES[path.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

export interface StaticFileServer {
	handle(request: Request): Response | undefined;
}

function fileResponse(path: string, extraHeaders: Record<string, string> = {}): Response {
	return new Response(Bun.file(path), {
		headers: { 'content-type': contentType(path), ...extraHeaders }
	});
}

/**
 * Serves the built client assets from a local directory. Only GET/HEAD are
 * served, paths are confined to the root, and `/` resolves to `index.html`.
 */
export function createStaticFileServer(root: string): StaticFileServer {
	const directory = resolve(root);
	return {
		handle(request: Request): Response | undefined {
			if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
			let pathname: string;
			try {
				pathname = decodeURIComponent(new URL(request.url).pathname);
			} catch {
				return new Response('Not found.', { status: 404 });
			}
			// Normalize and confine the resolved path to the asset root. Bun.serve
			// already rejects `..` segments in request URLs with a 400, but the
			// guard keeps this handler safe for any caller.
			const path = resolve(join(directory, normalize(pathname)));
			if (path !== directory && !path.startsWith(directory + sep)) {
				return new Response('Not found.', { status: 404 });
			}
			const index = join(path, 'index.html');
			if (existsSync(index) && statSync(index).isFile()) {
				// The HTML shell references hashed assets and must not be cached.
				return fileResponse(index, NO_STORE);
			}
			if (existsSync(path) && statSync(path).isFile()) {
				// Vite emits hashed assets under `assets/`; they are immutable.
				return fileResponse(path, path.includes(`${sep}assets${sep}`) ? {
					'cache-control': 'public, max-age=31536000, immutable'
				} : {});
			}
			// There is only one route, so unknown paths fall back to the shell.
			const shell = join(directory, 'index.html');
			if (existsSync(shell)) return fileResponse(shell, NO_STORE);
			return new Response('Not found.', { status: 404 });
		}
	};
}
