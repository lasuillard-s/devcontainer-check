import AdmZip from 'adm-zip';
import type { ProbotOctokit } from 'probot';
import { describe, expect, it, vi } from 'vitest';
import {
	createWorkflowDispatch,
	downloadArtifactFile,
	findArtifactByName,
	Repo
} from '../src/octokit.js';

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
