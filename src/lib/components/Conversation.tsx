import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { isConversationAtBottom, scrollConversationToBottom } from './conversation-scroll';
import { MessageCard } from './MessageCard';
import { ToolCard } from './ToolCard';

export function Conversation() {
	const app = useAppState();
	const scrollerRef = useRef<HTMLElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const wasFollowingRef = useRef(true);
	const showScrollButtonRef = useRef(false);

	// We need to track scroll state imperatively to avoid unnecessary re-renders
	const [, forceUpdate] = useState(0);

	function toolsFor(messageId: string) {
		return app.conversation.tools.filter((tool) => tool.parentMessageId === messageId);
	}

	const isAtBottom = useCallback(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return true;
		return isConversationAtBottom(scroller);
	}, []);

	const updateScrollState = useCallback(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		wasFollowingRef.current = isAtBottom();
		const newShow = scroller.scrollHeight > scroller.clientHeight && !wasFollowingRef.current;
		if (newShow !== showScrollButtonRef.current) {
			showScrollButtonRef.current = newShow;
			forceUpdate((n) => n + 1);
		}
	}, [isAtBottom]);

	const scrollToBottom = useCallback(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		scrollConversationToBottom(scroller);
		wasFollowingRef.current = true;
		showScrollButtonRef.current = false;
		forceUpdate((n) => n + 1);
	}, []);

	// Auto-scroll when conversation updates
	useEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		if (wasFollowingRef.current) {
			scrollConversationToBottom(scroller);
		}
		updateScrollState();
	});

	// ResizeObserver
	useEffect(() => {
		const scroller = scrollerRef.current;
		const content = contentRef.current;
		if (!scroller || !content) return;
		const resize = () => {
			if (wasFollowingRef.current) scroller.scrollTo({ top: scroller.scrollHeight });
			updateScrollState();
		};
		const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
		observer?.observe(scroller);
		observer?.observe(content);
		window.addEventListener('resize', resize);
		updateScrollState();
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', resize);
		};
	}, [updateScrollState]);

	return (
		<div className="relative min-h-0 flex-1">
			<section
				ref={scrollerRef}
				onScroll={updateScrollState}
				className="h-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-8"
				aria-label="Conversation"
				aria-live="polite"
			>
				<div ref={contentRef} className="mx-auto flex w-full max-w-5xl flex-col gap-6">
					{app.conversation.messages.length === 0 ? (
						<div className="grid min-h-64 place-items-center px-4 py-10 text-center">
							<div className="max-w-xl">
								<div className="mx-auto mb-6 flex w-fit items-center gap-1.5" aria-hidden="true">
									<span className="h-px w-10 bg-slate-300 dark:bg-slate-700" />
									<span className="size-2 bg-blue-500" />
									<span className="h-px w-10 bg-slate-300 dark:bg-slate-700" />
								</div>
								<p className="text-[10px] font-bold tracking-[0.24em] text-blue-700 uppercase dark:text-blue-300">
									Workspace ready
								</p>
								<h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-slate-900 sm:text-3xl dark:text-white">
									What should Pi work on?
								</h1>
								<p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
									Describe an outcome, point to relevant files, or ask for an investigation. Progress,
									tool calls, and changes will stream into this workspace.
								</p>
							</div>
						</div>
					) : (
						<>
							{app.conversation.messages.map((message) => (
								<MessageCard key={message.id} message={message} tools={toolsFor(message.id)} />
							))}
							{app.conversation.tools
								.filter((tool) => !tool.parentMessageId)
								.map((tool) => (
									<ToolCard key={tool.id} tool={tool} />
								))}
						</>
					)}

					{app.conversation.lastError && (
						<p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
							{app.conversation.lastError}
						</p>
					)}
				</div>
			</section>
			{showScrollButtonRef.current && (
				<button
					type="button"
					aria-label="Scroll to bottom"
					className="absolute right-4 bottom-3 z-10 min-h-11 min-w-11 border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 shadow-lg transition hover:border-blue-400 hover:text-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none sm:right-6 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-offset-slate-950"
					onClick={scrollToBottom}
				>
					<span aria-hidden="true">↓</span> <span className="sr-only sm:not-sr-only">Latest</span>
				</button>
			)}
		</div>
	);
}

