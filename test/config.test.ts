import { Probot } from 'probot';
import { beforeEach, describe, expect, vi } from 'vitest';
import { DEFAULT_BRANCH_ALIAS, loadConfig } from '../src/config.js';
import { test as it } from './helpers.js';

describe('loadConfig', () => {
	let probot: Probot;

	beforeEach(() => {
		probot = {
			log: {
				error: vi.fn()
			}
		} as unknown as Probot;
	});

	it('loads valid config with reasonable defaults', () => {
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
	});

	it('loads valid config with explicit configuration values', () => {
		// Arrange
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/private-runner');
		vi.stubEnv('RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE', 'false');
		vi.stubEnv('CHECK_WORKFLOW_NAME', 'custom-check.yaml');
		vi.stubEnv('CHECK_WORKFLOW_REF', 'release-1');
		vi.stubEnv('CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME', 'my-workflow-inputs');
		vi.stubEnv('CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH', 'my-inputs.json');
		vi.stubEnv('PUSH_BRANCHES', 'main,develop');
		vi.stubEnv('PR_BRANCHES', 'feature/*');

		// Act & Assert
		const config = loadConfig(probot);
		expect(config).toMatchObject({
			RUNNER_REPOSITORY: { owner: 'acme', repo: 'devcontainer-check-runner' },
			RUNNER_REPOSITORY_FOR_PRIVATE: { owner: 'acme', repo: 'private-runner' },
			RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE: false,
			CHECK_WORKFLOW_NAME: 'custom-check.yaml',
			CHECK_WORKFLOW_REF: 'release-1',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: 'my-workflow-inputs',
			CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: 'my-inputs.json',
			PUSH_BRANCHES: ['main', 'develop'],
			PR_BRANCHES: ['feature/*']
		});
	});

	it('exits when RUNNER_REPOSITORY format is invalid', () => {
		// Arrange
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check/extra');
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit called');
		});

		// Act & Assert
		expect(() => loadConfig(probot)).toThrow('process.exit called');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('rejects empty CHECK_WORKFLOW_NAME', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
		vi.stubEnv('CHECK_WORKFLOW_NAME', '');
		expect(() => loadConfig(probot)).toThrow();
	});

	it('rejects empty CHECK_WORKFLOW_REF', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
		vi.stubEnv('CHECK_WORKFLOW_REF', '');
		expect(() => loadConfig(probot)).toThrow();
	});

	it('defaults PUSH_BRANCHES and PR_BRANCHES to empty array when set to empty string', () => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
		vi.stubEnv('PUSH_BRANCHES', '');
		vi.stubEnv('PR_BRANCHES', '');
		const config = loadConfig(probot);
		expect(config.PUSH_BRANCHES).toStrictEqual([]);
		expect(config.PR_BRANCHES).toStrictEqual([]);
	});
});
