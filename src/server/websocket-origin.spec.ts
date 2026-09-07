import { describe, expect, it } from 'vitest';
import { hasSameWebSocketOrigin } from './websocket-origin.js';

describe('WebSocket origin validation', () => {
	it('accepts only the HTTP origin serving the WebSocket endpoint', () => {
		expect(
			hasSameWebSocketOrigin(
				new Request('http://127.0.0.1:3000/ws', {
					headers: { origin: 'http://127.0.0.1:3000' }
				})
			)
		).toBe(true);
		expect(
			hasSameWebSocketOrigin(
				new Request('http://127.0.0.1:3000/ws', {
					headers: { origin: 'https://attacker.example' }
				})
			)
		).toBe(false);
		expect(hasSameWebSocketOrigin(new Request('http://127.0.0.1:3000/ws'))).toBe(false);
	});
});
