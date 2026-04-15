import { Probot } from 'probot';
import { beforeEach, describe, expect, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { test } from './helpers.js';

describe('loadConfig', () => {
	let probot: Probot;

	beforeEach(() => {
		probot = {
			log: {
				error: vi.fn()
			}
		} as unknown as Probot;
	});

	test('loads valid config and applies defaults', () => {
		// Arrange
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');

		// Act & Assert
		expect(loadConfig(probot)).toStrictEqual({
			RUNNER_REPOSITORY: 'acme/devcontainer-check-runner',
			CHECK_WORKFLOW_NAME: 'devcontainer-check.yaml',
			CHECK_WORKFLOW_REF: null,
			CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: 'workflow-inputs',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: 'inputs.json'
		});
	});

	test('loads valid config with explicit workflow values', () => {
		// Arrange
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
		vi.stubEnv('CHECK_WORKFLOW_NAME', 'custom-check.yaml');
		vi.stubEnv('CHECK_WORKFLOW_REF', 'release-1');

		// Act & Assert
		expect(loadConfig(probot)).toStrictEqual({
			RUNNER_REPOSITORY: 'acme/devcontainer-check-runner',
			CHECK_WORKFLOW_NAME: 'custom-check.yaml',
			CHECK_WORKFLOW_REF: 'release-1',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: 'workflow-inputs',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: 'inputs.json'
		});
	});

	test('logs and exits when RUNNER_REPOSITORY is invalid', () => {
		// Arrange
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check/extra');
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
			throw new Error('process.exit called');
		}) as (code?: string | number | null | undefined) => never);

		// Act & Assert
		expect(() => loadConfig(probot)).toThrow('process.exit called');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
