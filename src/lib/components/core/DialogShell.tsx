import type { ReactNode } from 'react';

type DialogKind = 'center' | 'top' | 'drawer';
type MaxWidth = 'md' | 'lg' | 'xl' | '2xl';

const overlayClasses = {
	center: 'fixed inset-0 z-30 grid place-items-end bg-slate-950/55 p-3 backdrop-blur-[2px] sm:place-items-center',
	top: 'fixed inset-0 z-30 bg-slate-950/50 p-3 backdrop-blur-[2px] sm:grid sm:place-items-start sm:pt-20',
	drawer: 'fixed inset-0 z-30 bg-slate-950/55 p-0 backdrop-blur-[2px] sm:p-4'
} as const;

const maxWidthClasses: Record<MaxWidth, string> = {
	md: 'max-w-md',
	lg: 'max-w-lg',
	xl: 'max-w-xl',
	'2xl': 'max-w-2xl'
};

function panelClasses(kind: DialogKind, width: MaxWidth): string {
	const widthClass = maxWidthClasses[width];
	return kind === 'drawer'
		? `ml-auto flex h-full w-full ${widthClass} flex-col border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900`
		: `mx-auto w-full ${widthClass} overflow-hidden border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900`;
}

interface DialogShellProps {
	children?: ReactNode;
	ariaLabel: string;
	kind?: DialogKind;
	maxWidth?: MaxWidth;
	layer?: 'normal' | 'raised';
	className?: string;
	style?: React.CSSProperties;
}

export function DialogShell({
	children,
	ariaLabel,
	kind = 'center',
	maxWidth = 'lg',
	layer = 'normal',
	className = '',
	style
}: DialogShellProps) {
	return (
		<div
			className={`${overlayClasses[kind]} ${layer === 'raised' ? 'z-40' : ''}`}
			style={style}
			role="presentation"
		>
			<div
				className={`${panelClasses(kind, maxWidth)} ${className}`}
				role="dialog"
				aria-modal="true"
				aria-label={ariaLabel}
			>
				{children}
			</div>
		</div>
	);
}
