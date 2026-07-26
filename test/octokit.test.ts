import type { ProbotOctokit } from 'probot';
import { describe, expect, vi } from 'vitest';
import { createWorkflowDispatch, Repo } from '../src/octokit.js';
import { test as it } from './helpers.js';

describe('Repo', () => {
	it('toFullName returns owner/repo format', () => {
		expect(new Repo('owner', 'repo').toFullName()).toBe('owner/repo');
	});

	it('fromFullName parses owner/repo', () => {
		expect(Repo.fromFullName('owner/repo')).toEqual(new Repo('owner', 'repo'));
	});

	it('equals compares owner and repo', () => {
		expect(new Repo('owner', 'repo').equals(new Repo('owner', 'repo'))).toBe(true);
		expect(new Repo('owner', 'repo').equals(new Repo('other', 'repo'))).toBe(false);
		expect(new Repo('owner', 'repo').equals(new Repo('owner', 'other'))).toBe(false);
	});
});

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
