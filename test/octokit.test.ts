import AdmZip from 'adm-zip';
import type { ProbotOctokit } from 'probot';
import { describe, expect, test, vi } from 'vitest';
import { createWorkflowDispatch, downloadArtifactFileJSON } from '../src/octokit.js';

// eslint-disable-next-line jsdoc/require-jsdoc
function createMockOctokit() {
	return {
		actions: {
			createWorkflowDispatch: vi.fn(),
			listWorkflowRunArtifacts: vi.fn(),
			downloadArtifact: vi.fn()
		}
	} as unknown as ProbotOctokit;
}

describe('createWorkflowDispatch', () => {
	test('returns run details when return_run_details is true', async () => {
		// Arrange
		const octokit = createMockOctokit();
		const runDetails = {
			html_url: 'https://github.com/example-org/runner-repo/actions/runs/123456789',
			run_url: 'https://api.github.com/repos/example-org/runner-repo/actions/runs/123456789',
			workflow_run_id: 123456789
		};
		vi.mocked(octokit.actions.createWorkflowDispatch).mockResolvedValue({
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

	test('returns undefined when return_run_details is false', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.actions.createWorkflowDispatch).mockResolvedValue({
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

describe('downloadArtifactFileJSON', () => {
	test('returns null when matching artifact does not exist', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: { artifacts: [] }
		} as never);

		// Act
		const result = await downloadArtifactFileJSON<{ owner: string }>(octokit, {
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'inputs.json'
		});

		// Assert
		expect(result).toBeNull();
		expect(octokit.actions.downloadArtifact).not.toHaveBeenCalled();
	});

	test('returns null when requested file is not present in artifact zip', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		const zip = new AdmZip();
		zip.addFile('different-file.json', Buffer.from('{"ok":true}'));
		vi.mocked(octokit.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);

		// Act
		const result = await downloadArtifactFileJSON<{ owner: string }>(octokit, {
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'inputs.json'
		});

		// Assert
		expect(result).toBeNull();
	});

	test('parses and returns JSON from requested file in artifact zip', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		const zip = new AdmZip();
		zip.addFile(
			'inputs.json',
			Buffer.from(JSON.stringify({ owner: 'target-org', repo: 'target-repo', ref: 'deadbeef' }))
		);
		vi.mocked(octokit.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);

		// Act
		const result = await downloadArtifactFileJSON<{
			owner: string;
			repo: string;
			ref: string;
		}>(octokit, {
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'inputs.json'
		});

		// Assert
		expect(result).toStrictEqual({
			owner: 'target-org',
			repo: 'target-repo',
			ref: 'deadbeef'
		});
	});
});
