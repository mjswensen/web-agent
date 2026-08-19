import { useEffect, useState } from 'react';
import { useAppState } from '$lib/state/app-context';
import { Button } from './core/Button';
import { DialogHeader } from './core/DialogHeader';
import { DialogShell } from './core/DialogShell';

export function CommandPalette() {
	const app = useAppState();
	const [viewportStyle, setViewportStyle] = useState<React.CSSProperties>({});
	const query = app.editorText.startsWith('/') ? app.editorText.slice(1).toLowerCase() : '';
	const matches = app.commands.filter((command) => {
		const name = typeof command.name === 'string' ? command.name : '';
		const description = typeof command.description === 'string' ? command.description : '';
		return `${name} ${description}`.toLowerCase().includes(query);
	});

	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const update = () => {
			setViewportStyle({
				top: `${viewport.offsetTop}px`,
				height: `${viewport.height}px`,
				bottom: 'auto'
			});
		};
		update();
		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);
		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
		};
	}, []);

	function select(command: Record<string, unknown>) {
		if (typeof command.name !== 'string') return;
		app.setEditorText(`/${command.name} `);
		app.setLayout('commandPaletteOpen', false);
	}

	if (!app.layout.commandPaletteOpen) return null;

	return (
		<DialogShell kind="top" maxWidth="2xl" ariaLabel="Commands" style={viewportStyle}>
			<div
				className="flex max-h-[calc(100dvh-1.5rem)] flex-col"
				style={{ maxHeight: 'calc(100% - 1.5rem)' }}
			>
				<DialogHeader
					title="Commands"
					titleSize="sm"
					description="Choose a command, prompt template, or skill to insert."
					actions={
						<Button
							variant="muted"
							size="sm"
							onClick={() => app.setLayout('commandPaletteOpen', false)}
						>
							Close
						</Button>
					}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
					{matches.length === 0 ? (
						<p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
							No matching command is available.
						</p>
					) : (
						matches.map((command) => (
							<button
								key={typeof command.name === 'string' ? command.name : JSON.stringify(command)}
								type="button"
								className="flex min-h-12 w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-slate-800"
								onClick={() => select(command)}
							>
								<span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
									/{typeof command.name === 'string' ? command.name : 'command'}
								</span>
								{typeof command.description === 'string' && (
									<span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
										{command.description}
									</span>
								)}
							</button>
						))
					)}
				</div>
			</div>
		</DialogShell>
	);
}
