import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpConfigController, validateMcpDocument } from './mcp-config.js';

describe('MCP configuration', () => {
	it('validates transports, names and exposure without reflecting secrets', () => {
		expect(() => validateMcpDocument('{secret')).toThrow('valid JSON');
		for (const server of [
			{ command: 'x', url: 'https://example.com' },
			{ url: 'file:///secret' },
			{ command: 'x', args: 'secret' },
			{ command: 'x', enabled: 'secret' },
			{ command: 'x', exposure: 'secret' },
			{ command: 'x', type: 'sse' }
		]) {
			expect(() =>
				validateMcpDocument(JSON.stringify({ mcpServers: { tools: server } }))
			).toThrow();
		}
		expect(() =>
			validateMcpDocument(
				JSON.stringify({ mcpServers: { 'a-b': { command: 'x' }, a_b: { command: 'x' } } })
			)
		).toThrow('unique');
		expect(() =>
			validateMcpDocument(
				JSON.stringify({
					mcpServers: {
						tools: {
							command: 'npx',
							args: ['server'],
							env: { TOKEN: '${TOKEN}' },
							exposure: 'deferred',
							enabled: false
						},
						docs: {
							url: 'https://example.com/mcp',
							oauth: { clientId: 'client' },
							toolExposure: { 'read_*': 'direct' }
						}
					}
				})
			)
		).not.toThrow();
	});

	it('persists only the fixed file privately and detects stale browser edits', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'web-agent-mcp-'));
		try {
			const controller = new McpConfigController(dir);
			const initial = await controller.get();
			const text = JSON.stringify({
				mcpServers: { tools: { command: 'echo', enabled: false } },
				custom: 'preserved'
			});
			await controller.save(text, initial.revision);
			expect(await readFile(join(dir, 'mcp.json'), 'utf8')).toBe(text);
			expect((await stat(join(dir, 'mcp.json'))).mode & 0o777).toBe(0o600);
			await expect(controller.save('{"mcpServers":{}}', initial.revision)).rejects.toThrow(
				'changed'
			);
			await expect(controller.save('{bad', (await controller.get()).revision)).rejects.toThrow(
				'valid JSON'
			);
			expect((await controller.get()).text).toBe(text);
			await expect(new McpConfigController(dir, false).get()).rejects.toThrow('loopback');
			await expect(
				new McpConfigController(dir, false).save(text, initial.revision)
			).rejects.toThrow('loopback');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
