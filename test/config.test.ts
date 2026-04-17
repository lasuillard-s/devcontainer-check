import { Probot } from 'probot';
import { beforeEach, describe, expect, vi } from 'vitest';
import { DEFAULT_BRANCH_ALIAS, loadConfig } from '../src/config.js';
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
		// Arrange (required only)
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');

		// Act & Assert
		expect(loadConfig(probot)).toStrictEqual({
			RUNNER_REPOSITORY: { owner: 'acme', repo: 'devcontainer-check-runner' },
			CHECK_WORKFLOW_NAME: 'devcontainer-check.yaml',
			CHECK_WORKFLOW_REF: DEFAULT_BRANCH_ALIAS,
			CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: 'workflow-inputs',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: 'inputs.json',
			PUSH_BRANCHES: [DEFAULT_BRANCH_ALIAS],
			PR_BRANCHES: [DEFAULT_BRANCH_ALIAS]
		});
	});

	test('loads valid config with explicit configuration values', () => {
		// Arrange
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
		vi.stubEnv('CHECK_WORKFLOW_NAME', 'custom-check.yaml');
		vi.stubEnv('CHECK_WORKFLOW_REF', 'release-1');
		vi.stubEnv('CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME', 'my-workflow-inputs');
		vi.stubEnv('CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH', 'my-inputs.json');
		vi.stubEnv('PUSH_BRANCHES', 'main,develop');
		vi.stubEnv('PR_BRANCHES', 'feature/*');

		// Act & Assert
		expect(loadConfig(probot)).toStrictEqual({
			RUNNER_REPOSITORY: { owner: 'acme', repo: 'devcontainer-check-runner' },
			CHECK_WORKFLOW_NAME: 'custom-check.yaml',
			CHECK_WORKFLOW_REF: 'release-1',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: 'my-workflow-inputs',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: 'my-inputs.json',
			PUSH_BRANCHES: ['main', 'develop'],
			PR_BRANCHES: ['feature/*']
		});
	});

	test('logs and exits when RUNNER_REPOSITORY format is invalid', () => {
		// Arrange
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check/extra');
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit called');
		});

		// Act & Assert
		expect(() => loadConfig(probot)).toThrow('process.exit called');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
