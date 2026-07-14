import { describe, expect, it } from 'vitest';
import { isDevContainerFileChanged } from '../src/devcontainer.js';

describe('isDevContainerFileChanged', () => {
	it('returns true when .devcontainer file is changed', () => {
		expect(isDevContainerFileChanged(['src/app.ts', '.devcontainer/devcontainer.json'])).toBe(true);
		expect(
			isDevContainerFileChanged(['.github/workflows/ci.yaml', '.devcontainer/onCreateCommand.sh'])
		).toBe(true);
	});

	it('returns true when .devcontainer.example file is changed', () => {
		expect(
			isDevContainerFileChanged(['docs/readme.md', '.devcontainer.example/devcontainer.json'])
		).toBe(true);
		expect(
			isDevContainerFileChanged([
				'.github/workflows/ci.yaml',
				'.devcontainer.example/onCreateCommand.sh'
			])
		).toBe(true);
	});

	it('returns false when no devcontainer-related files are changed', () => {
		expect(isDevContainerFileChanged(['src/app.ts', 'README.md'])).toBe(false);
	});

	it('returns false for files exactly named .devcontainer or .devcontainer.example', () => {
		expect(isDevContainerFileChanged(['.devcontainer'])).toBe(false);
		expect(isDevContainerFileChanged(['.devcontainer.example'])).toBe(false);
	});

	it('returns false for empty array', () => {
		expect(isDevContainerFileChanged([])).toBe(false);
	});

	it('returns true for files in subdirectories', () => {
		expect(isDevContainerFileChanged(['.devcontainer/extensions/ms-azuretools.json'])).toBe(true);
		expect(isDevContainerFileChanged(['.devcontainer.example/tasks/postCreateCommand.sh'])).toBe(
			true
		);
	});
});
