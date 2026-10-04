import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSdkRuntime } from './sdk-runtime.js';
import { SdkTransport } from './sdk-transport.js';
import { McpConfigController } from './mcp-config.js';

// Only a local fake stdio server is launched; no real credentials/providers are used.
describe('SDK built-in MCP resources', () => {
	it('loads only bundled factories, honors project trust, and rebinds on replacement', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'web-agent-runtime-'));
		const previous = process.env.PI_CODING_AGENT_DIR;
		const offline = process.env.PI_OFFLINE;
		process.env.PI_CODING_AGENT_DIR = join(dir, 'agent');
		process.env.PI_OFFLINE = '1';
		const cwd = join(dir, 'project');
		await mkdir(join(cwd, '.pi'), { recursive: true });
		await mkdir(join(dir, 'agent'), { recursive: true });
		await writeFile(join(dir, 'agent', 'settings.json'), '{"defaultProjectTrust":"never"}');
		await writeFile(
			join(cwd, '.pi', 'mcp.json'),
			'{"mcpServers":{"untrusted":{"command":"must-not-run"}}}'
		);
		await writeFile(
			join(cwd, '.pi', 'extensions.ts'),
			'throw new Error("must not load external extensions");'
		);
		let owner: Awaited<ReturnType<typeof createSdkRuntime>> | undefined;
		try {
			owner = await createSdkRuntime({ noSession: true, continueSession: false }, cwd);
			expect(owner.runtime.session.settingsManager.isProjectTrusted()).toBe(false);
			expect(owner.runtime.session.getAllTools().map((tool) => tool.name)).toEqual(
				expect.arrayContaining(['codemode', 'tool_search'])
			);
			expect(owner.runtime.session.getActiveToolNames()).not.toContain('codemode');
			const fakeServer = `
				let buffer = '';
				process.stdin.on('data', chunk => {
					buffer += chunk;
					while (buffer.includes('\\n')) {
						const end = buffer.indexOf('\\n');
						const request = JSON.parse(buffer.slice(0, end));
						buffer = buffer.slice(end + 1);
						if (request.id === undefined) continue;
						const result = request.method === 'initialize'
							? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } }
							: { tools: [{ name: 'ping', description: 'Fake ping', inputSchema: { type: 'object', properties: {} } }] };
						process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
					}
				});
			`;
			await writeFile(
				join(dir, 'agent', 'mcp.json'),
				JSON.stringify({
					mcpServers: { fake: { command: process.execPath, args: ['-e', fakeServer] } }
				})
			);
			await owner.runtime.session.reload();
			await expect
				.poll(() => owner!.runtime.session.getAllTools().map((tool) => tool.name))
				.toContain('mcp__fake__ping');
			expect(owner.runtime.session.getActiveToolNames()).toContain('codemode');
			const transport = new SdkTransport(
				owner.runtime,
				new McpConfigController(join(dir, 'agent'))
			);
			const records: unknown[] = [];
			transport.onRecord((record) => records.push(record));
			await transport.send({ id: 'status', type: 'get_mcp_status' });
			expect(records).toContainEqual(
				expect.objectContaining({
					id: 'status',
					success: true,
					data: { status: 'fake: connected, 1 tools (codemode)' }
				})
			);
			transport.dispose();
			expect(owner.runtime.session.getAllTools().map((tool) => tool.name)).not.toContain(
				'mcp__untrusted__ping'
			);
			await owner.runtime.newSession();
			await expect
				.poll(() => owner!.runtime.session.getAllTools().map((tool) => tool.name))
				.toContain('mcp__fake__ping');
			expect(owner.runtime.session.getAllTools().map((tool) => tool.name)).toContain('codemode');
		} finally {
			await owner?.close();
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			if (offline === undefined) delete process.env.PI_OFFLINE;
			else process.env.PI_OFFLINE = offline;
			await rm(dir, { recursive: true, force: true });
		}
	});
});
