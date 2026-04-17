import { describe, expect } from 'vitest';
import { isDevContainerFileChanged } from '../src/devcontainer.js';
import { test } from './helpers.js';

describe('isDevContainerFileChanged', () => {
	test('returns true when .devcontainer file is changed', () => {
		expect(isDevContainerFileChanged(['src/app.ts', '.devcontainer/devcontainer.json'])).toBe(true);
		expect(
			isDevContainerFileChanged(['.github/workflows/ci.yaml', '.devcontainer/onCreateCommand.sh'])
		).toBe(true);
	});

	test('returns true when .devcontainer.example file is changed', () => {
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

	test('returns false when no devcontainer-related files are changed', () => {
		expect(isDevContainerFileChanged(['src/app.ts', 'README.md'])).toBe(false);
	});
});
