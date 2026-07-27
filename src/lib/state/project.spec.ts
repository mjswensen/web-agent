import { describe, expect, it } from 'vitest';
import { projectDirectoryName } from './project.js';

describe('project directory display', () => {
	it('returns the last segment for POSIX and Windows paths', () => {
		expect(projectDirectoryName('/workspaces/web-agent')).toBe('web-agent');
		expect(projectDirectoryName('C:\\Users\\me\\web-agent')).toBe('web-agent');
	});

	it('handles directory roots without returning an empty title segment', () => {
		expect(projectDirectoryName('/')).toBe('/');
		expect(projectDirectoryName('C:\\')).toBe('C:\\');
	});
});
