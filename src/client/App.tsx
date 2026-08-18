import './app.css';
import { useMemo } from 'react';
import { AppState } from '$lib/state/app-state';
import { AppStateContext } from '$lib/state/app-context';
import { WsClientContext, useWebSocketClient } from '$lib/client/use-ws-client';
import { AppShell } from '$lib/components/AppShell';

function AppInner() {
	const app = useMemo(() => new AppState(), []);
	const client = useWebSocketClient(app);

	return (
		<AppStateContext.Provider value={app}>
			<WsClientContext.Provider value={client}>
				<AppShell />
			</WsClientContext.Provider>
		</AppStateContext.Provider>
	);
}

export function App() {
	return <AppInner />;
}
