import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AppState } from './app-state.js';

export const AppStateContext = createContext<AppState | null>(null);

/** Access the app state and subscribe to changes. */
export function useAppState(): AppState {
	const state = useContext(AppStateContext);
	if (!state) throw new Error('useAppState must be used within AppStateContext.Provider');
	useSyncExternalStore(
		(cb) => state.subscribe(cb),
		() => state.getSnapshot()
	);
	return state;
}
