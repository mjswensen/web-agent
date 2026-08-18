import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { contentType, createStaticFileServer } from './static-files.js';

const root = mkdtempSync(join(tmpdir(), 'web-agent-static-'));
mkdirSync(join(root, 'assets'), { recursive: true });
mkdirSync(join(root, 'nested'), { recursive: true });
writeFileSync(join(root, 'index.html'), '<!doctype html><title>shell</title>');
writeFileSync(join(root, 'assets', 'app-a1b2c3.js'), 'console.log("app");');
writeFileSync(join(root, 'nested', 'index.html'), '<!doctype html><title>nested</title>');

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

function get(path: string, init?: RequestInit): Response | undefined {
	return createStaticFileServer(root).handle(new Request(`http://localhost${path}`, init));
}

describe('createStaticFileServer', () => {
	it('serves index.html for the root with a no-store cache policy', async () => {
		const response = get('/');
		expect(response?.status).toBe(200);
		expect(response?.headers.get('content-type')).toBe('text/html;charset=utf-8');
		expect(response?.headers.get('cache-control')).toBe('no-store');
		await expect(response?.text()).resolves.toContain('shell');
	});

	it('serves hashed assets as immutable', async () => {
		const response = get('/assets/app-a1b2c3.js');
		expect(response?.status).toBe(200);
		expect(response?.headers.get('content-type')).toBe('text/javascript;charset=utf-8');
		expect(response?.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
	});

	it('serves index.html for directory paths', async () => {
		const response = get('/nested');
		expect(response?.status).toBe(200);
		await expect(response?.text()).resolves.toContain('nested');
	});

	it('falls back to the shell for unknown paths', async () => {
		const response = get('/no/such/file.js');
		expect(response?.status).toBe(200);
		expect(response?.headers.get('content-type')).toBe('text/html;charset=utf-8');
		await expect(response?.text()).resolves.toContain('shell');
	});

	it('confines traversal attempts to the root', async () => {
		const response = get('/../outside.txt');
		expect([200, 404]).toContain(response?.status);
		if (response?.status === 200) {
			// A fallback to the shell is acceptable; outside content is not.
			await expect(response.text()).resolves.toContain('shell');
		}
	});

	it('returns 404 when the root has no index.html', () => {
		const empty = mkdtempSync(join(tmpdir(), 'web-agent-empty-'));
		try {
			const response = createStaticFileServer(empty).handle(
				new Request('http://localhost/anything')
			);
			expect(response?.status).toBe(404);
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	it('does not serve non-GET methods', () => {
		expect(get('/', { method: 'POST' })).toBeUndefined();
		expect(get('/', { method: 'DELETE' })).toBeUndefined();
		expect(get('/', { method: 'HEAD' })?.status).toBe(200);
	});
});

describe('contentType', () => {
	it('maps known extensions and defaults to octet-stream', () => {
		expect(contentType('app.css')).toBe('text/css;charset=utf-8');
		expect(contentType('logo.PNG')).toBe('image/png');
		expect(contentType('archive.bin')).toBe('application/octet-stream');
		expect(contentType('no-extension')).toBe('application/octet-stream');
	});
});
