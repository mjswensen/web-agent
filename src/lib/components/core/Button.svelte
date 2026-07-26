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
		sm: 'min-h-9 rounded px-2 text-xs',
		md: 'min-h-11 rounded-lg',
		touch: 'min-h-11 rounded-lg text-sm',
		toolbar: 'min-h-9 rounded px-2',
		icon: 'min-h-8 min-w-8 rounded',
		tool: 'min-h-9 shrink-0 rounded px-2'
	};

	const variantClasses: Record<ButtonVariant, string> = {
		primary:
			'bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-300',
		secondary:
			'border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50',
		ghost: 'hover:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none',
		muted:
			'font-semibold text-slate-600 hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-none',
		danger:
			'bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:outline-none disabled:bg-red-300',
		'soft-blue':
			'border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		'soft-red':
			'border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
	};
</script>

<button {...rest} class={`${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
	{@render children?.()}
</button>
