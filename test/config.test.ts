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
		const config = loadConfig(probot);
		expect(config).toMatchObject({
			RUNNER_REPOSITORY: { owner: 'acme', repo: 'devcontainer-check-runner' },
			CHECK_WORKFLOW_NAME: 'devcontainer-check.yaml',
			CHECK_WORKFLOW_REF: DEFAULT_BRANCH_ALIAS,
			CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: 'workflow-inputs',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: 'inputs.json',
			PUSH_BRANCHES: [DEFAULT_BRANCH_ALIAS],
			PR_BRANCHES: [DEFAULT_BRANCH_ALIAS]
		});
		expect(config.RUNNER_REPOSITORY_DISABLE_GUARDRAIL).toBeUndefined();
		expect(config.resolveRunnerRepository('public')).toStrictEqual({
			owner: 'acme',
			repo: 'devcontainer-check-runner'
		});
		expect(config.resolveRunnerRepository('private')).toStrictEqual({
			owner: 'acme',
			repo: 'devcontainer-check-runner'
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
		vi.stubEnv('RUNNER_REPOSITORY_DISABLE_GUARDRAIL', 'true');

		// Act & Assert
		const config = loadConfig(probot);
		expect(config).toMatchObject({
			RUNNER_REPOSITORY: { owner: 'acme', repo: 'devcontainer-check-runner' },
			CHECK_WORKFLOW_NAME: 'custom-check.yaml',
			CHECK_WORKFLOW_REF: 'release-1',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: 'my-workflow-inputs',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: 'my-inputs.json',
			PUSH_BRANCHES: ['main', 'develop'],
			PR_BRANCHES: ['feature/*']
		});
		expect(config.RUNNER_REPOSITORY_DISABLE_GUARDRAIL).toBe(true);
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

	test('resolves public runner repository for public target repos, falls back for private', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PUBLIC', 'acme/public-runner');

		const config = loadConfig(probot);
		// Public target uses public runner
		expect(config.resolveRunnerRepository('public')).toStrictEqual({
			owner: 'acme',
			repo: 'public-runner'
		});
		// Private target falls back to default runner
		expect(config.resolveRunnerRepository('private')).toStrictEqual({
			owner: 'acme',
			repo: 'runner'
		});
	});

	test('resolves private runner repository for private target repos, falls back for public', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/private-runner');

		const config = loadConfig(probot);
		// Private target uses private runner
		expect(config.resolveRunnerRepository('private')).toStrictEqual({
			owner: 'acme',
			repo: 'private-runner'
		});
		// Public target falls back to default runner
		expect(config.resolveRunnerRepository('public')).toStrictEqual({
			owner: 'acme',
			repo: 'runner'
		});
	});

	test('falls back to RUNNER_REPOSITORY when visibility-specific runner is not configured', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');

		const config = loadConfig(probot);
		expect(config.resolveRunnerRepository('private')).toStrictEqual({
			owner: 'acme',
			repo: 'runner'
		});
		expect(config.resolveRunnerRepository('public')).toStrictEqual({
			owner: 'acme',
			repo: 'runner'
		});
	});
});
