#!/usr/bin/env bun
/**
 * Minimal `pi --mode rpc` stand-in used by the Playwright E2E web server. The
 * E2E suite replaces the browser WebSocket with an in-browser fake, so this
 * child only needs to start, accept JSONL commands on stdin, and answer each
 * request with a correlated, mostly-empty response.
 */
const writer = process.stdout.writer();

const responses: Record<string, unknown> = {
	get_state: { isStreaming: false },
	get_messages: { messages: [] },
	get_commands: { commands: [] },
	get_session_stats: {},
	get_session_list: { sessions: [] }
};

const reader = Bun.stdin.stream();
const decoder = new TextDecoder();
let pending = '';
for await (const chunk of reader) {
	pending += decoder.decode(chunk, { stream: true });
	let newline = pending.indexOf('\n');
	while (newline >= 0) {
		const record = pending.slice(0, newline);
		pending = pending.slice(newline + 1);
		newline = pending.indexOf('\n');
		if (!record.trim()) continue;
		try {
			const command = JSON.parse(record) as { type?: string; id?: unknown };
			if (command.id === undefined) continue;
			const type = command.type ?? '';
			await writer.write(
				JSON.stringify({
					type: 'response',
					id: command.id,
					command: type,
					success: true,
					data: responses[type] ?? {}
				}) + '\n'
			);
			await writer.flush();
		} catch {
			// Ignore malformed records; the real Pi would report a protocol error.
		}
	}
}
