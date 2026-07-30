<script lang="ts">
	import type { Snippet } from 'svelte';

	type DialogKind = 'center' | 'top' | 'drawer';
	type MaxWidth = 'md' | 'lg' | 'xl' | '2xl';

	let {
		children,
		ariaLabel,
		kind = 'center',
		maxWidth = 'lg',
		layer = 'normal',
		class: className = '',
		style = ''
	}: {
		children?: Snippet;
		ariaLabel: string;
		kind?: DialogKind;
		maxWidth?: MaxWidth;
		layer?: 'normal' | 'raised';
		class?: string;
		style?: string;
	} = $props();

	const overlayClasses = {
		center: 'fixed inset-0 z-30 grid place-items-end bg-slate-950/30 p-3 sm:place-items-center',
		top: 'fixed inset-0 z-30 bg-slate-950/20 p-3 sm:grid sm:place-items-start sm:pt-20',
		drawer: 'fixed inset-0 z-30 bg-slate-950/30 p-3 sm:p-6'
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
			? `ml-auto flex h-full w-full ${widthClass} flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900`
			: `mx-auto w-full ${widthClass} overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900`;
	}
</script>

<div
	class={`${overlayClasses[kind]} ${layer === 'raised' ? 'z-40' : ''}`}
	{style}
	role="presentation"
>
	<div
		class={`${panelClasses(kind, maxWidth)} ${className}`}
		role="dialog"
		aria-modal="true"
		aria-label={ariaLabel}
	>
		{@render children?.()}
	</div>
</div>
