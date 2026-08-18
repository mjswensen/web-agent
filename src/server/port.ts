export type PortProbe = (host: string, port: number) => number;

function probePort(host: string, port: number): number {
	const listener = Bun.listen({
		hostname: host,
		port,
		socket: { data: () => undefined }
	});
	const selectedPort = listener.port;
	listener.stop(true);
	return selectedPort;
}

function errorCode(error: unknown): string | undefined {
	return typeof error === 'object' && error !== null && 'code' in error
		? String(error.code)
		: undefined;
}

/** Selects the requested port or the next available one using Bun's TCP listener. */
export function findAvailablePort(
	host: string,
	requestedPort: number,
	probe: PortProbe = probePort
): number {
	// Port zero asks the OS to select an ephemeral port and should not enter the upward scan.
	if (requestedPort === 0) return probe(host, 0);
	for (let port = requestedPort; port <= 65_535; port += 1) {
		try {
			return probe(host, port);
		} catch (error) {
			if (errorCode(error) !== 'EADDRINUSE' || port === 65_535) throw error;
		}
	}
	throw new Error('No available local TCP port was found.');
}
