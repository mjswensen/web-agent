import { useState } from 'react';
import type { AppState } from '$lib/state/app-state';
import type { WebAgentWebSocketClient } from '$lib/client/ws-client';

interface SessionTreeNodeProps {
	node: Record<string, unknown>;
	depth: number;
	app: AppState;
	client: WebAgentWebSocketClient | null;
}

export function SessionTreeNode({ node, depth, app, client }: SessionTreeNodeProps) {
	const [expanded, setExpanded] = useState(false);

	const entry =
		node.entry && typeof node.entry === 'object' && !Array.isArray(node.entry)
			? (node.entry as Record<string, unknown>)
			: {};
	const children = Array.isArray(node.children)
		? node.children.filter(
				(child): child is Record<string, unknown> =>
					typeof child === 'object' && child !== null && !Array.isArray(child)
			)
		: [];
	const isForkable =
		entry.type === 'message' &&
		entry.message &&
		typeof entry.message === 'object' &&
		!Array.isArray(entry.message) &&
		(entry.message as Record<string, unknown>).role === 'user';
	const summary =
		typeof entry.message === 'object' && entry.message !== null && !Array.isArray(entry.message)
			? (() => {
					const message = entry.message as Record<string, unknown>;
					return typeof message.content === 'string' ? message.content : (entry.type as string);
				})()
			: typeof entry.type === 'string'
				? entry.type
				: 'entry';
	const label = typeof node.label === 'string' ? node.label : undefined;
	const timestamp =
		typeof entry.timestamp === 'number' || typeof entry.timestamp === 'string'
			? new Date(entry.timestamp as number | string).toLocaleString()
			: undefined;

	async function fork() {
		if (!client || typeof entry.id !== 'string') return;
		try {
			const response = await client.sendCommand('fork', { entryId: entry.id });
			if (!response.success)
				app.addToast(response.error ?? 'Unable to fork from this message.', 'error');
		} catch (error) {
			app.setConnectionError(error instanceof Error ? error.message : String(error));
		}
	}

	return (
		<div className="border-l border-slate-200 pl-3" style={{ marginLeft: `${depth * 12}px` }}>
			<div
				className={`flex min-h-9 items-center gap-2 rounded px-2 text-xs ${entry.id === app.activeTreeLeafId ? 'bg-blue-50 text-blue-900' : 'text-slate-700'}`}
			>
				{children.length > 0 ? (
					<button
						type="button"
						className="min-h-8 min-w-8 rounded hover:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						onClick={() => setExpanded(!expanded)}
						aria-expanded={expanded}
					>
						{expanded ? '−' : '+'}
					</button>
				) : (
					<span className="inline-block w-8 text-center text-slate-400">·</span>
				)}
				<span className="min-w-0 flex-1 truncate" title={summary}>
					{summary}
				</span>
				<span className="hidden shrink-0 text-[10px] text-slate-500 sm:inline">
					{typeof entry.type === 'string' ? entry.type : 'entry'}
					{label ? ` · ${label}` : ''}
					{timestamp ? ` · ${timestamp}` : ''}
				</span>
				{isForkable ? (
					<button
						type="button"
						className="min-h-8 rounded px-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						onClick={() => void fork()}
					>
						Fork
					</button>
				) : null}
			</div>
			{expanded &&
				children.map((child) => {
					const childEntry =
						typeof child.entry === 'object' && child.entry !== null && !Array.isArray(child.entry)
							? (child.entry as Record<string, unknown>)
							: {};
					return (
						<SessionTreeNode
							key={typeof childEntry.id === 'string' ? childEntry.id : JSON.stringify(child)}
							node={child}
							depth={depth + 1}
							app={app}
							client={client}
						/>
					);
				})}
		</div>
	);
}
