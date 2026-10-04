import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const emptyConfig = '{\n\t"mcpServers": {}\n}\n';
const exposures = new Set(['codemode', 'codemode-deferred', 'deferred', 'direct', 'hidden']);

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the editable document without including submitted values in errors. Pi validates
 * advanced OAuth/provider options and reports connection problems when resources reload. */
export function validateMcpDocument(text: string): void {
	if (text.length > 256 * 1024) throw new Error('MCP configuration is too large.');
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		throw new Error('MCP configuration must be valid JSON.');
	}
	if (!object(doc) || !object(doc.mcpServers))
		throw new Error('Expected an object containing mcpServers.');
	if (doc.autoEnableCodemode !== undefined && typeof doc.autoEnableCodemode !== 'boolean')
		throw new Error('autoEnableCodemode must be a boolean.');
	const names = new Set<string>();
	for (const [name, server] of Object.entries(doc.mcpServers)) {
		const normalized = name.replaceAll('-', '_');
		if (!/^[a-zA-Z0-9_-]+$/.test(name) || names.has(normalized))
			throw new Error(
				'Server names must be unique and use letters, digits, underscores or hyphens.'
			);
		names.add(normalized);
		if (!object(server)) throw new Error('Each server must be an object.');
		const stdio = typeof server.command === 'string' && server.command.trim().length > 0;
		const http = typeof server.url === 'string' && server.url.trim().length > 0;
		if (stdio === http) throw new Error('Each user server needs either command or url, not both.');
		if (
			server.type !== undefined &&
			![stdio ? 'stdio' : 'http', ...(http ? ['streamable-http'] : [])].includes(
				String(server.type)
			)
		)
			throw new Error('Server type must match its transport; SSE is unsupported.');
		if (http) {
			try {
				if (!['http:', 'https:'].includes(new URL(String(server.url)).protocol)) throw new Error();
			} catch {
				throw new Error('Server URLs must use HTTP or HTTPS.');
			}
		}
		if (server.enabled !== undefined && typeof server.enabled !== 'boolean')
			throw new Error('enabled must be a boolean.');
		if (server.timeout !== undefined && (typeof server.timeout !== 'number' || server.timeout <= 0))
			throw new Error('timeout must be a positive number of seconds.');
		if (server.exposure !== undefined && !exposures.has(String(server.exposure)))
			throw new Error('Invalid server exposure.');
		if (
			server.args !== undefined &&
			(!Array.isArray(server.args) || !server.args.every((arg) => typeof arg === 'string'))
		)
			throw new Error('args must be an array of strings.');
		for (const key of ['env', 'headers', 'toolExposure']) {
			const values = server[key];
			if (
				values !== undefined &&
				(!object(values) ||
					!Object.values(values).every(
						(value) => typeof value === 'string' && (key !== 'toolExposure' || exposures.has(value))
					))
			)
				throw new Error(`${key} must be an object of valid string values.`);
		}
	}
}

function revision(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

/** Only the fixed user mcp.json is editable. Never broadcast its potentially secret contents. */
export class McpConfigController {
	private readonly path: string;
	constructor(
		agentDir: string,
		private readonly enabled = true
	) {
		this.path = join(agentDir, 'mcp.json');
	}
	private assertEnabled(): void {
		if (!this.enabled) throw new Error('MCP configuration requires loopback or --allow-web-auth.');
	}
	async get(): Promise<{ text: string; revision: string }> {
		this.assertEnabled();
		let text: string;
		try {
			text = await readFile(this.path, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
				throw new Error('Cannot read MCP configuration.', { cause: error });
			text = emptyConfig;
		}
		return { text, revision: revision(text) };
	}
	async save(text: string, expectedRevision: string): Promise<void> {
		this.assertEnabled();
		validateMcpDocument(text);
		if ((await this.get()).revision !== expectedRevision)
			throw new Error('MCP configuration changed. Reopen this dialog before saving.');
		const temp = `${this.path}.${randomUUID()}.tmp`;
		try {
			await mkdir(dirname(this.path), { recursive: true });
			await writeFile(temp, text, { mode: 0o600 });
			await rename(temp, this.path);
		} catch {
			throw new Error('Cannot save MCP configuration.');
		} finally {
			await rm(temp, { force: true });
		}
	}
}
