import { describe, expect, it, vi } from 'vitest';
import { ViteHotSocket } from './vite-hot-socket.js';

class FakeHotChannel {
	readonly sent: Array<{ event: string; data: unknown }> = [];
	private readonly listeners = new Map<string, Set<(data: unknown) => void>>();

	send(event: string, data?: unknown): void {
		this.sent.push({ event, data });
	}
	on(event: string, callback: (data: unknown) => void): void {
		let listeners = this.listeners.get(event);
		if (!listeners) this.listeners.set(event, (listeners = new Set()));
		listeners.add(callback);
	}
	off(event: string, callback: (data: unknown) => void): void {
		this.listeners.get(event)?.delete(callback);
	}
	emit(event: string, data: unknown): void {
		for (const listener of this.listeners.get(event) ?? []) listener(data);
	}
}

describe('Vite hot socket', () => {
	it('presents the WebSocket lifecycle while exchanging HMR custom events', async () => {
		const hot = new FakeHotChannel();
		const socket = new ViteHotSocket(hot);
		const opened = vi.fn();
		const message = vi.fn();
		const closed = vi.fn();
		socket.onopen = opened;
		socket.onmessage = message;
		socket.onclose = closed;

		await vi.waitFor(() => expect(hot.sent[0]?.event).toBe('web-agent:connect'));
		hot.emit('web-agent:open', { connectionId: socket.connectionId });
		expect(opened).toHaveBeenCalledOnce();
		expect(socket.readyState).toBe(WebSocket.OPEN);

		socket.send('{"kind":"ping"}');
		expect(hot.sent.at(-1)).toEqual({
			event: 'web-agent:message',
			data: { connectionId: socket.connectionId, text: '{"kind":"ping"}' }
		});
		hot.emit('web-agent:frame', { connectionId: socket.connectionId, text: '{"kind":"pong"}' });
		expect(message.mock.calls[0]?.[0]).toMatchObject({ data: '{"kind":"pong"}' });

		socket.close(1000, 'done');
		expect(socket.readyState).toBe(WebSocket.CLOSED);
		expect(closed).toHaveBeenCalledOnce();
	});
});
