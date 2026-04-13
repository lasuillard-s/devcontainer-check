import type { Probot } from 'probot';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
	let probot: Probot;

	beforeEach(() => {
		probot = {
			log: { error: vi.fn() }
		} as unknown as Probot;
	});

	test('loads valid config and applies defaults', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');

		expect(loadConfig(probot)).toStrictEqual({
			RUNNER_REPOSITORY: 'acme/devcontainer-check-runner',
			CHECK_WORKFLOW_ID: 'devcontainer-check.yaml',
			CHECK_WORKFLOW_REF: null
		});
	});

	test('loads valid config with explicit workflow values', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
		vi.stubEnv('CHECK_WORKFLOW_ID', 'custom-check.yaml');
		vi.stubEnv('CHECK_WORKFLOW_REF', 'release-1');

		expect(loadConfig(probot)).toStrictEqual({
			RUNNER_REPOSITORY: 'acme/devcontainer-check-runner',
			CHECK_WORKFLOW_ID: 'custom-check.yaml',
			CHECK_WORKFLOW_REF: 'release-1'
		});
	});

	test('logs and exits when RUNNER_REPOSITORY is invalid', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check/extra');

		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
			throw new Error('process.exit called');
		}) as (code?: string | number | null | undefined) => never);

		expect(() => loadConfig(probot)).toThrow('process.exit called');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
