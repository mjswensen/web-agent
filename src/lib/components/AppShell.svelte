<script lang="ts">
	import { onMount } from 'svelte';
	import { WebAgentWebSocketClient } from '$lib/client/ws-client';
	import { getAppState } from '$lib/state/app-context.svelte';
	import Conversation from './Conversation.svelte';
	import Editor from './Editor.svelte';

	const app = getAppState();
	let client = $state<WebAgentWebSocketClient | undefined>(undefined);
	let cwd = $derived(
		typeof app.sessionState?.cwd === 'string' ? app.sessionState.cwd : 'local project'
	);

	onMount(() => {
		const socket = new WebAgentWebSocketClient({ state: app });
		client = socket;
		socket.connect();
		return () => socket.disconnect();
	});
</script>

<div class="flex h-dvh min-h-0 flex-col bg-slate-100 font-mono text-slate-900">
	<header class="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
		<div
			class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-5 gap-y-2"
		>
			<div class="flex min-w-0 items-center gap-3">
				<div
					class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-900 text-xs font-bold text-white"
					aria-hidden="true"
				>
					π
				</div>
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<p class="text-sm font-bold tracking-tight">Web Agent</p>
						<span
							class={`h-2 w-2 rounded-full ${app.connection.status === 'connected' ? 'bg-emerald-500' : app.connection.status === 'connecting' ? 'animate-pulse bg-amber-400' : 'bg-slate-400'}`}
						></span>
					</div>
					<p class="max-w-58 truncate text-[11px] text-slate-500" title={cwd}>{cwd}</p>
				</div>
			</div>
			<div class="text-right text-[11px] leading-5 text-slate-500">
				<p>{app.sessionName ?? 'New session'}</p>
				<p>
					{app.connection.status === 'connected'
						? app.isAgentActive
							? 'Agent working'
							: 'Ready'
						: app.connection.status}
				</p>
			</div>
		</div>
	</header>

	<Conversation state={app} />
	<Editor {app} {client} />

	<footer
		class="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 sm:px-6"
	>
		<div class="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-x-4 gap-y-1">
			<span>{app.connection.statusMessage ?? 'Local Pi RPC connection'}</span>
			<span>{app.isAgentActive ? 'Streaming' : 'Idle'}</span>
		</div>
	</footer>
</div>
