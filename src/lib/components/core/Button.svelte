<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type ButtonVariant =
		'primary' | 'secondary' | 'ghost' | 'muted' | 'danger' | 'soft-blue' | 'soft-red';
	type ButtonSize = 'sm' | 'md' | 'touch' | 'toolbar' | 'icon' | 'tool';

	let {
		variant = 'secondary',
		size = 'md',
		children,
		class: className = '',
		...rest
	}: HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		children?: Snippet;
	} = $props();

	const sizeClasses: Record<ButtonSize, string> = {
		sm: 'min-h-9 px-2 text-xs',
		md: 'min-h-11',
		touch: 'min-h-11 text-sm',
		toolbar: 'min-h-9 px-2 text-[11px]',
		icon: 'min-h-8 min-w-8',
		tool: 'min-h-9 shrink-0 px-2'
	};

	const variantClasses: Record<ButtonVariant, string> = {
		primary:
			'bg-blue-600 px-4 text-sm font-bold text-white shadow-[2px_2px_0_var(--color-blue-900)] transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-400',
		secondary:
			'border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
		ghost:
			'text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
		muted:
			'font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-none dark:text-slate-300 dark:hover:bg-slate-800',
		danger:
			'bg-red-700 px-4 text-sm font-bold text-white transition-colors hover:bg-red-800 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-red-300 dark:disabled:bg-red-950 dark:disabled:text-red-400',
		'soft-blue':
			'border border-blue-300 bg-blue-50 px-4 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900',
		'soft-red':
			'border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900'
	};
</script>

<button {...rest} class={`${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
	{@render children?.()}
</button>
