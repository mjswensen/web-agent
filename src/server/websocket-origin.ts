/** Reject cross-site WebSocket upgrades before they can reach privileged browser commands. */
export function hasSameWebSocketOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return false;
	try {
		return new URL(origin).origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}
