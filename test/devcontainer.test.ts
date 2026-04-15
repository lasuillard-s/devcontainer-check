import type { Context } from 'probot';
import { beforeEach, describe, expect, vi } from 'vitest';
import { isDevContainerFileChanged } from '../src/devcontainer.js';
import { test } from './helpers.js';

describe('isDevContainerFileChanged', () => {
	let context: Context<'push'>;

	beforeEach(() => {
		context = {
			log: {
				debug: vi.fn()
			}
		} as unknown as Context<'push'>;
	});

	test('returns true when .devcontainer file is changed', () => {
		expect(
			isDevContainerFileChanged(context, ['src/app.ts', '.devcontainer/devcontainer.json'])
		).toBe(true);
		expect(
			isDevContainerFileChanged(context, [
				'.github/workflows/ci.yaml',
				'.devcontainer/onCreateCommand.sh'
			])
		).toBe(true);
	});

	test('returns true when .devcontainer.example file is changed', () => {
		expect(
			isDevContainerFileChanged(context, [
				'docs/readme.md',
				'.devcontainer.example/devcontainer.json'
			])
		).toBe(true);
		expect(
			isDevContainerFileChanged(context, [
				'.github/workflows/ci.yaml',
				'.devcontainer.example/onCreateCommand.sh'
			])
		).toBe(true);
	});

	test('returns false when no devcontainer-related files are changed', () => {
		expect(isDevContainerFileChanged(context, ['src/app.ts', 'README.md'])).toBe(false);
	});
});
