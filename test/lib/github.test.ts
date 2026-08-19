import AdmZip from 'adm-zip';
import type { Logger } from 'pino';
import type { Context, ProbotOctokit } from 'probot';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BRANCH_ALIAS } from '../../src/config.js';
import { CHECK_RUN_NAME } from '../../src/constants.js';
import {
	createWorkflowDispatch,
	dispatchCheckWorkflow,
	downloadArtifactFile,
	fetchInputs,
	findArtifactByName,
	Repo,
	type WorkflowInputs
} from '../../src/lib/github.js';

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
				createWorkflowDispatch: vi.fn(),
				listWorkflowRunArtifacts: vi.fn(),
				downloadArtifact: vi.fn()
			},
			repos: {
				get: vi.fn()
			},
			checks: {
				create: vi.fn()
			}
		}
	} as unknown as ProbotOctokit;
}

// eslint-disable-next-line jsdoc/require-jsdoc
function createMockLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	} as unknown as Logger;
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

describe('findArtifactByName', () => {
	it('returns null when matching artifact does not exist', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: { artifacts: [] }
		} as never);

		const result = await findArtifactByName(octokit, {
			repo: new Repo('example-org', 'runner-repo'),
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs'
		});

		expect(result).toBeNull();
		expect(octokit.rest.actions.downloadArtifact).not.toHaveBeenCalled();
	});

	it('returns the matching artifact when found', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [
					{ id: 1, name: 'other-artifact' },
					{ id: 42, name: 'workflow-inputs' }
				]
			}
		} as never);

		const result = await findArtifactByName(octokit, {
			repo: new Repo('example-org', 'runner-repo'),
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs'
		});

		expect(result).toBe(42);
	});

	it('throws when listWorkflowRunArtifacts throws', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockRejectedValue(
			new Error('network error')
		);

		await expect(
			findArtifactByName(octokit, {
				repo: new Repo('example-org', 'runner-repo'),
				workflowRunId: 123456789,
				artifactName: 'workflow-inputs'
			})
		).rejects.toThrow('network error');
	});
});

describe('downloadArtifactFile', () => {
	it('returns the file content as Buffer when file exists in zip', async () => {
		const octokit = createMockOctokit();
		const zip = new AdmZip();
		zip.addFile('inputs.json', Buffer.from('{"ok":true}'));
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);

		const result = await downloadArtifactFile(octokit, {
			repo: new Repo('example-org', 'runner-repo'),
			artifactId: 42,
			filePath: 'inputs.json'
		});

		expect(result).toBeInstanceOf(Buffer);
		expect(result?.toString('utf-8')).toBe('{"ok":true}');
	});

	it('returns null when requested file is not present in artifact zip', async () => {
		const octokit = createMockOctokit();
		const zip = new AdmZip();
		zip.addFile('different-file.json', Buffer.from('{"ok":true}'));
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);

		const result = await downloadArtifactFile(octokit, {
			repo: new Repo('example-org', 'runner-repo'),
			artifactId: 42,
			filePath: 'inputs.json'
		});

		expect(result).toBeNull();
	});

	it('throws when downloadArtifact throws', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.downloadArtifact).mockRejectedValue(
			new Error('download failed')
		);

		await expect(
			downloadArtifactFile(octokit, {
				repo: new Repo('example-org', 'runner-repo'),
				artifactId: 42,
				filePath: 'inputs.json'
			})
		).rejects.toThrow('download failed');
	});
});

describe('fetchInputs', () => {
	const repo = new Repo('example-org', 'runner-repo');
	const inputs: WorkflowInputs = {
		owner: 'target-org',
		repo: 'target-repo',
		sha: 'abc1234'
	};

	it('fetches and parses workflow inputs successfully', async () => {
		const octokit = createMockOctokit();
		const zip = new AdmZip();
		zip.addFile('inputs.json', Buffer.from(JSON.stringify(inputs)));

		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);

		const result = await fetchInputs(octokit, {
			repo,
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			artifactPath: 'inputs.json'
		});

		expect(result).toEqual(inputs);
	});

	it('returns null when artifact is not found', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: { artifacts: [] }
		} as never);

		const result = await fetchInputs(octokit, {
			repo,
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			artifactPath: 'inputs.json'
		});

		expect(result).toBeNull();
	});

	it('returns null when file is not found in artifact zip', async () => {
		const octokit = createMockOctokit();
		const zip = new AdmZip();
		zip.addFile('other.json', Buffer.from('{}'));

		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);

		const result = await fetchInputs(octokit, {
			repo,
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			artifactPath: 'inputs.json'
		});

		expect(result).toBeNull();
	});

	it('throws an error when JSON parsing fails', async () => {
		const octokit = createMockOctokit();
		const zip = new AdmZip();
		zip.addFile('inputs.json', Buffer.from('invalid-json'));

		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);

		await expect(
			fetchInputs(octokit, {
				repo,
				workflowRunId: 123456789,
				artifactName: 'workflow-inputs',
				artifactPath: 'inputs.json'
			})
		).rejects.toThrow('Failed to parse workflow inputs from artifact file');
	});
});

describe('dispatchCheckWorkflow', () => {
	const targetRepo = new Repo('target-org', 'target-repo');
	const runnerRepo = new Repo('runner-org', 'runner-repo');
	const sha = 'abcdef123456';

	it('resolves default branch and creates in-progress check run on success', async () => {
		const octokit = createMockOctokit();
		const log = createMockLogger();
		vi.mocked(octokit.rest.repos.get).mockResolvedValue({
			data: { default_branch: 'main' }
		} as never);
		vi.mocked(octokit.rest.actions.createWorkflowDispatch).mockResolvedValue({
			data: { html_url: 'https://github.com/runner-org/runner-repo/actions/runs/999' }
		} as never);
		vi.mocked(octokit.rest.checks.create).mockResolvedValue({} as never);

		await dispatchCheckWorkflow({ octokit, log } as unknown as Context, {
			repo: targetRepo,
			sha,
			runnerRepo,
			workflowName: 'devcontainer-check.yaml',
			workflowRef: DEFAULT_BRANCH_ALIAS
		});

		expect(octokit.rest.repos.get).toHaveBeenCalledWith({
			owner: 'runner-org',
			repo: 'runner-repo'
		});
		expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
			owner: 'runner-org',
			repo: 'runner-repo',
			workflow_id: 'devcontainer-check.yaml',
			ref: 'main',
			inputs: { owner: 'target-org', repo: 'target-repo', sha },
			return_run_details: true
		});
		expect(octokit.rest.checks.create).toHaveBeenCalledWith({
			owner: 'target-org',
			repo: 'target-repo',
			head_sha: sha,
			name: CHECK_RUN_NAME,
			status: 'in_progress',
			details_url: 'https://github.com/runner-org/runner-repo/actions/runs/999',
			output: {
				title: 'Checking for dev container configuration...',
				summary: 'Check is in progress. This might take a few minutes.'
			}
		});
	});

	it('uses explicit workflowRef directly without querying default branch', async () => {
		const octokit = createMockOctokit();
		const log = createMockLogger();
		vi.mocked(octokit.rest.actions.createWorkflowDispatch).mockResolvedValue({
			data: { html_url: 'https://github.com/runner-org/runner-repo/actions/runs/999' }
		} as never);
		vi.mocked(octokit.rest.checks.create).mockResolvedValue({} as never);

		await dispatchCheckWorkflow({ octokit, log } as unknown as Context, {
			repo: targetRepo,
			sha,
			runnerRepo,
			workflowName: 'devcontainer-check.yaml',
			workflowRef: 'v1.0.0'
		});

		expect(octokit.rest.repos.get).not.toHaveBeenCalled();
		expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'v1.0.0' })
		);
	});

	it('creates failed check run when workflow dispatch fails', async () => {
		const octokit = createMockOctokit();
		const log = createMockLogger();
		vi.mocked(octokit.rest.actions.createWorkflowDispatch).mockRejectedValue(
			new Error('API rate limit exceeded')
		);
		vi.mocked(octokit.rest.checks.create).mockResolvedValue({} as never);

		await dispatchCheckWorkflow({ octokit, log } as unknown as Context, {
			repo: targetRepo,
			sha,
			runnerRepo,
			workflowName: 'devcontainer-check.yaml',
			workflowRef: 'main'
		});

		expect(octokit.rest.checks.create).toHaveBeenCalledWith({
			owner: 'target-org',
			repo: 'target-repo',
			head_sha: sha,
			name: CHECK_RUN_NAME,
			status: 'completed',
			conclusion: 'failure',
			output: {
				title: 'Dev container configuration check failed to start.',
				summary: 'Failed to dispatch the validation workflow: API rate limit exceeded'
			}
		});
	});
});
