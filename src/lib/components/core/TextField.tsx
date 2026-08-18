import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {}

export function TextField({ className = '', ...rest }: TextFieldProps) {
	return (
		<input
			{...rest}
			className={`min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-700 ${className}`}
		/>
	);
}
