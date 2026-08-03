import type { JsonObject, JsonValue } from '../client/protocol.js';

export interface FooterContext {
	percent: number | undefined;
	percentage: string;
	details: string;
}

export interface FooterValues {
	model: string;
	thinking: string;
	tokens: string;
	cost: string;
	context: FooterContext;
}

function object(value: JsonValue | undefined): JsonObject | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function number(value: JsonValue | undefined): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function displayNumber(value: number | undefined): string {
	return value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
}

/** Converts sparse RPC state/stats to footer-safe display values without fabricating zeroes. */
export function deriveFooterValues(
	stateData: JsonValue | undefined,
	statsData: JsonValue | undefined
): FooterValues {
	const state = object(stateData);
	const stats = object(statsData);
	const model = object(state?.model);
	const tokens = object(stats?.tokens);
	const contextUsage = object(stats?.contextUsage);
	const input = number(tokens?.input);
	const output = number(tokens?.output);
	const cacheRead = number(tokens?.cacheRead);
	const cacheWrite = number(tokens?.cacheWrite);
	const contextPercent = number(contextUsage?.percent);
	const contextTokens = number(contextUsage?.tokens);
	const contextWindow = number(contextUsage?.contextWindow);
	const cost = number(stats?.cost);

	return {
		model:
			typeof model?.name === 'string' ? model.name : typeof model?.id === 'string' ? model.id : '—',
		thinking: typeof state?.thinkingLevel === 'string' ? state.thinkingLevel : '—',
		tokens:
			input === undefined &&
			output === undefined &&
			cacheRead === undefined &&
			cacheWrite === undefined
				? '—'
				: `${displayNumber(input)} in / ${displayNumber(output)} out · ${displayNumber(cacheRead)} cache read / ${displayNumber(cacheWrite)} cache write`,
		cost: cost === undefined ? '—' : `$${cost.toFixed(4)}`,
		context:
			contextPercent === undefined
				? { percent: undefined, percentage: '—', details: '' }
				: {
						percent: contextPercent,
						percentage: `${contextPercent.toFixed(1)}%`,
						details:
							contextTokens === undefined || contextWindow === undefined
								? ''
								: ` (${displayNumber(contextTokens)} / ${displayNumber(contextWindow)})`
					}
	};
}
