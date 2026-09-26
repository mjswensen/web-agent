import { Markdown } from './Markdown';

interface ThinkingBlockProps {
	thinking: string;
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
	return (
		<section className="mb-4 border-l-2 border-violet-400 bg-violet-50/60 dark:bg-violet-950/25">
			<h3 className="px-3 pt-3 text-[10px] font-bold tracking-[0.16em] text-violet-700 uppercase dark:text-violet-300">
				Reasoning trace
			</h3>
			<div className="min-w-0 px-3 py-3">
				<Markdown source={thinking} compact reasoning />
			</div>
		</section>
	);
}
