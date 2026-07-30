export const conversationBottomThreshold = 32;

export interface ScrollMetrics {
	scrollHeight: number;
	scrollTop: number;
	clientHeight: number;
}

export function isConversationAtBottom(
	metrics: ScrollMetrics,
	threshold = conversationBottomThreshold
): boolean {
	return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

export function scrollConversationToBottom(
	scroller: Pick<HTMLElement, 'scrollHeight' | 'scrollTo'>,
	behavior: ScrollBehavior = 'smooth'
): void {
	scroller.scrollTo({ top: scroller.scrollHeight, behavior });
}
