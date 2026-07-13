import type { ProbotOctokit } from 'probot';
import { describe, expect, it, vi } from 'vitest';
import { createWorkflowDispatch } from '../src/octokit.js';

// eslint-disable-next-line jsdoc/require-jsdoc
function createMockOctokit() {
	return {
		rest: {
			actions: {
				createWorkflowDispatch: vi.fn()
			}
		}
	} as unknown as ProbotOctokit;
}

describe('createWorkflowDispatch', () => {
	it('returns run details when return_run_details is true', async () => {
		// Arrange
		const octokit = createMockOctokit();
		const runDetails = {
			html_url: 'https://github.com/example-org/runner-repo/actions/runs/123456789',
			run_url: 'https://api.github.com/repos/example-org/runner-repo/actions/runs/123456789',
			workflow_run_id: 123456789
		};
		vi.mocked(octokit.rest.actions.createWorkflowDispatch).mockResolvedValue({
			data: runDetails
		} as never);

		// Act
		const result = await createWorkflowDispatch(octokit, {
			owner: 'example-org',
			repo: 'runner-repo',
			workflow_id: 'devcontainer-check.yaml',
			ref: 'main',
			return_run_details: true
		});

		// Assert
		expect(result).toStrictEqual(runDetails);
	});

	it('returns undefined when return_run_details is false', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.createWorkflowDispatch).mockResolvedValue({
			data: {
				html_url: 'https://github.com/example-org/runner-repo/actions/runs/123456789'
			}
		} as never);

		// Act
		const result = await createWorkflowDispatch(octokit, {
			owner: 'example-org',
			repo: 'runner-repo',
			workflow_id: 'devcontainer-check.yaml',
			ref: 'main',
			return_run_details: false
		});

		// Assert
		expect(result).toBeUndefined();
	});
});
