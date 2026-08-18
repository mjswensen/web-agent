import { useMemo, useRef } from 'react';
import { renderMarkdown } from '$lib/format/markdown';

interface MarkdownProps {
	source: string;
	compact?: boolean;
}

export function Markdown({ source, compact = false }: MarkdownProps) {
	const cacheRef = useRef<{ source: string; html: string }>({ source: '', html: '' });
	const html = useMemo(() => {
		if (source !== cacheRef.current.source) {
			cacheRef.current = { source, html: renderMarkdown(source) };
		}
		return cacheRef.current.html;
	}, [source]);

	return (
		<div
			className={`markdown ${compact ? 'markdown-compact' : ''}`}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
