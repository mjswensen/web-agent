import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { WebAgentWebSocketClient } from './ws-client.js';
import type { AppState } from '../state/app-state.js';

export const WsClientContext = createContext<WebAgentWebSocketClient | null>(null);

export function useWsClient(): WebAgentWebSocketClient | null {
	return useContext(WsClientContext);
}

/** Creates and manages the WebSocket client lifecycle. */
export function useWebSocketClient(state: AppState): WebAgentWebSocketClient | null {
	const [client, setClient] = useState<WebAgentWebSocketClient | null>(null);
	const stateRef = useRef(state);
	stateRef.current = state;

	useEffect(() => {
		const socket = new WebAgentWebSocketClient({ state: stateRef.current });
		setClient(socket);
		socket.connect();
		return () => {
			socket.disconnect();
			setClient(null);
		};
	}, []);

	return client;
}
