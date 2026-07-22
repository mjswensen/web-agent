import { createContext } from 'svelte';
import type { AppState } from './app-state.svelte.js';

/** Typed, layout-scoped access to one browser/SSR request's app state. */
export const [getAppState, setAppState] = createContext<AppState>();
