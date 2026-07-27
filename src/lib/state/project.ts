import { win32 } from 'node:path';

/** Returns the final directory name from a POSIX or Windows-style path. */
export function projectDirectoryName(directory: string): string {
	return win32.basename(directory) || win32.parse(directory).root || directory;
}
