import type { ReactNode } from 'react';

interface DialogHeaderProps {
	title: string;
	description?: string;
	titleSize?: 'base' | 'sm';
	actions?: ReactNode;
}

export function DialogHeader({
	title,
	description,
	titleSize = 'base',
	actions
}: DialogHeaderProps) {
	return (
		<header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
			<div>
				<h2
					className={
						titleSize === 'sm'
							? 'text-sm font-semibold text-slate-900 dark:text-slate-100'
							: 'text-base font-semibold text-slate-900 dark:text-slate-100'
					}
				>
					{title}
				</h2>
				{description && (
					<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
				)}
			</div>
			{actions && <div className="flex gap-1">{actions}</div>}
		</header>
	);
}
