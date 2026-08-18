import type { ExtensionWidget } from '$lib/state/app-state';

interface WidgetRegionProps {
	widgets: ExtensionWidget[];
}

export function WidgetRegion({ widgets }: WidgetRegionProps) {
	if (widgets.length === 0) return null;
	return (
		<section
			className="border-t border-slate-200 bg-slate-50 px-4 py-2 sm:px-6 dark:border-slate-700 dark:bg-slate-950"
			aria-label="Extension widgets"
		>
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
				{widgets.map((widget) => (
					<pre
						key={widget.key}
						className="m-0 rounded border border-slate-200 bg-white px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
					>
						{widget.lines.join('\n')}
					</pre>
				))}
			</div>
		</section>
	);
}
