export interface AgentTransport {
	send(command: unknown): Promise<void>;
	onRecord(listener: (record: unknown) => void): () => void;
	onError(listener: (error: Error) => void): () => void;
}
