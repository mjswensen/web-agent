type IconName =
	| 'arrow-turn-down-left'
	| 'stop'
	| 'send'
	| 'steer'
	| 'history'
	| 'tree'
	| 'changes'
	| 'terminal'
	| 'commands'
	| 'providers'
	| 'mcp'
	| 'model'
	| 'thinking'
	| 'compact'
	| 'menu';

interface IconProps {
	name: IconName;
	className?: string;
}

export function Icon({ name, className = 'size-6' }: IconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			{name === 'steer' && (
				<>
					<circle cx="12" cy="12" r="10" />
					<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
				</>
			)}
			{name === 'send' && (
				<path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904zM6 12h16" />
			)}
			{name === 'stop' && <rect width="18" height="18" x="3" y="3" rx="2" />}
			{name === 'arrow-turn-down-left' && (
				<>
					<path d="M20 4v7a4 4 0 0 1-4 4H4" />
					<path d="m9 10-5 5 5 5" />
				</>
			)}
			{name === 'history' && (
				<>
					<path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" />
					<path d="M3 3v5h5m4-1v5l4 2" />
				</>
			)}
			{name === 'tree' && (
				<>
					<path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Zm0 11a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" />
					<path d="M3 5a2 2 0 0 0 2 2h3M3 3v13a2 2 0 0 0 2 2h3" />
				</>
			)}
			{name === 'changes' && (
				<>
					<path d="M4 7h10a2 2 0 0 1 2 2v8" />
					<path d="m8 3-4 4 4 4M20 17H10a2 2 0 0 1-2-2V7" />
					<path d="m16 21 4-4-4-4" />
				</>
			)}
			{name === 'terminal' && (
				<>
					<path d="m7 11 2-2-2-2m4 6h4" />
					<rect width="18" height="18" x="3" y="3" rx="2" />
				</>
			)}
			{name === 'commands' && (
				<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
			)}
			{name === 'providers' && (
				<path d="M12 22v-5m3-9V2m2 6a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zM9 8V2" />
			)}
			{name === 'mcp' && (
				<>
					<rect width="6" height="6" x="16" y="16" rx="1" />
					<rect width="6" height="6" x="2" y="16" rx="1" />
					<rect width="6" height="6" x="9" y="2" rx="1" />
					<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3m-7-4V8" />
				</>
			)}
			{name === 'model' && (
				<>
					<path d="M12 8V4H8" />
					<rect width="16" height="12" x="4" y="8" rx="2" />
					<path d="M2 14h2m16 0h2m-7-1v2m-6-2v2" />
				</>
			)}
			{name === 'thinking' && (
				<>
					<path d="M12 18V5m3 8a4.17 4.17 0 0 1-3-4a4.17 4.17 0 0 1-3 4m8.598-6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5M17.997 5.125a4 4 0 0 1 2.526 5.77M18 18a4 4 0 0 0 2-7.464M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517M6 18a4 4 0 0 1-2-7.464M6.003 5.125a4 4 0 0 0-2.526 5.77" />
				</>
			)}
			{name === 'compact' && <path d="m14 10 7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" />}
			{name === 'menu' && <path d="M4 5h16M4 12h16M4 19h16" />}
		</svg>
	);
}
