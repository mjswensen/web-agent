import type { TextareaHTMLAttributes } from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className = '', ...rest }: TextareaProps) {
	return (
		<textarea
			{...rest}
			className={`border border-slate-300 bg-white px-3 py-2 text-base leading-6 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-800 ${className}`}
		/>
	);
}
