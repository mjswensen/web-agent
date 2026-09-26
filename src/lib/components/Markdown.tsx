import { useMemo, useRef } from 'react';
import { renderMarkdown } from '$lib/format/markdown';

interface MarkdownProps {
	source: string;
	compact?: boolean;
	reasoning?: boolean;
}

export function Markdown({ source, compact = false, reasoning = false }: MarkdownProps) {
	const cacheRef = useRef<{ source: string; html: string }>({ source: '', html: '' });
	const html = useMemo(() => {
		if (source !== cacheRef.current.source) {
			cacheRef.current = { source, html: renderMarkdown(source) };
		}
		return cacheRef.current.html;
	}, [source]);

	return (
		<div
			className={`markdown ${compact ? 'markdown-compact' : ''} ${reasoning ? 'markdown-reasoning' : ''}`}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
