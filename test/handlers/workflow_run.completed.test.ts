import AdmZip from 'adm-zip';
import nock from 'nock';
import type { Probot, ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { beforeEach, describe, expect, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import type { WorkflowInputs } from '../../src/handlers/types.js';
import WorkflowRunCompletedHandler from '../../src/handlers/workflow_run.completed.js';
import payload from '../fixtures/workflow_run.completed.json' with { type: 'json' };
import { test as it } from '../helpers.js';

/**
 * Thin subclass that exposes the (protected) artifact-download helper for unit testing.
 */
class TestableHandler extends WorkflowRunCompletedHandler {
	download<ParseAs>(params: {
		owner: string;
		repo: string;
		workflowRunId: number;
		artifactName: string;
		filePath: string;
	}): Promise<ParseAs | null> {
		return this.downloadArtifactFileJSON<ParseAs>(params);
	}
}

// eslint-disable-next-line jsdoc/require-jsdoc
function createHandler(octokit: ProbotOctokit): TestableHandler {
	vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
	const probot = {
		log: { error: vi.fn() }
	} as unknown as Probot;
	const config = loadConfig(probot);
	const context = {
		octokit,
		log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		repo: () => ({ owner: 'owner', repo: 'repo' }),
		payload: {}
	} as unknown as Context;
	return new TestableHandler(context, config);
}

const installationId: number = payload.installation.id;
const owner: string = payload.repository.owner.login;
const repo: string = payload.repository.name;

beforeEach(() => {
	vi.stubEnv('RUNNER_REPOSITORY', 'lasuillard-s/devcontainer-check');
	vi.stubEnv('CHECK_WORKFLOW_NAME', 'devcontainer-check.yaml');
	vi.stubEnv('CHECK_WORKFLOW_REF', undefined);
});

it('ignores workflow run from non-runner repository', async ({ probot }) => {
	// Arrange
	const payloadWithDifferentRepo = structuredClone(payload);
	payloadWithDifferentRepo.repository.full_name = 'other-org/other-repo';
	payloadWithDifferentRepo.repository.owner.login = 'other-org';
	payloadWithDifferentRepo.repository.name = 'other-repo';
	const mock = nock('https://api.github.com');

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'workflow_run', payload: payloadWithDifferentRepo });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

describe('when runner repository matches', () => {
	it('updates commit status to success when workflow run completes successfully', async ({
		probot
	}) => {
		// Arrange
		const zip = new AdmZip();
		const inputs: WorkflowInputs = { owner: 'target-org', repo: 'target-repo', sha: 'abc1234' };
		zip.addFile('inputs.json', Buffer.from(JSON.stringify(inputs)));
		const zipBuffer = zip.toBuffer();
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, { token: 'test', permissions: { actions: 'write' } })
			.get(`/repos/${owner}/${repo}/actions/runs/${payload.workflow_run.id}/artifacts`)
			.reply(200, { total_count: 1, artifacts: [{ id: 42, name: 'workflow-inputs' }] })
			.get(`/repos/${owner}/${repo}/actions/artifacts/42/zip`)
			.reply(200, zipBuffer, { 'Content-Type': 'application/zip' })
			.post('/repos/target-org/target-repo/check-runs', (body: unknown) => {
				expect(body).toStrictEqual({
					head_sha: 'abc1234',
					name: 'Dev Container Check',
					status: 'completed',
					conclusion: 'success',
					details_url: payload.workflow_run.html_url,
					output: {
						title: 'Dev container configuration is valid.',
						summary: 'Check the workflow run details for more information.'
					}
				});
				return true;
			})
			.reply(201);

		// Act
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'workflow_run', payload });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	it('updates commit status to failure when workflow run does not succeed', async ({ probot }) => {
		// Arrange
		const failedPayload = structuredClone(payload);
		failedPayload.workflow_run.conclusion = 'failure';
		const zip = new AdmZip();
		const inputs: WorkflowInputs = { owner: 'target-org', repo: 'target-repo', sha: 'abc1234' };
		zip.addFile('inputs.json', Buffer.from(JSON.stringify(inputs)));
		const zipBuffer = zip.toBuffer();
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, { token: 'test', permissions: { actions: 'write' } })
			.get(`/repos/${owner}/${repo}/actions/runs/${failedPayload.workflow_run.id}/artifacts`)
			.reply(200, { total_count: 1, artifacts: [{ id: 42, name: 'workflow-inputs' }] })
			.get(`/repos/${owner}/${repo}/actions/artifacts/42/zip`)
			.reply(200, zipBuffer, { 'Content-Type': 'application/zip' })
			.post('/repos/target-org/target-repo/check-runs', (body: unknown) => {
				expect(body).toStrictEqual({
					head_sha: 'abc1234',
					name: 'Dev Container Check',
					status: 'completed',
					conclusion: 'failure',
					details_url: failedPayload.workflow_run.html_url,
					output: {
						title: 'Dev container configuration check failed.',
						summary: 'Check the workflow run details for more information.'
					}
				});
				return true;
			})
			.reply(201);

		// Act
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'workflow_run', payload: failedPayload });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	it('skips status update when workflow inputs artifact is not found', async ({ probot }) => {
		// Arrange
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, { token: 'test', permissions: { actions: 'write' } })
			.get(`/repos/${owner}/${repo}/actions/runs/${payload.workflow_run.id}/artifacts`)
			.reply(200, { total_count: 0, artifacts: [] });

		// Act
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'workflow_run', payload });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	it('ignores when workflow path is null', async ({ probot }) => {
		const payloadWithNullPath = structuredClone(payload);

		// @ts-expect-error Ignore fixture modification
		payloadWithNullPath.workflow = { path: null };

		const mock = nock('https://api.github.com');

		// Act
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'workflow_run', payload: payloadWithNullPath });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	it('treats null conclusion as failure', async ({ probot }) => {
		const payloadWithNullConclusion = structuredClone(payload);

		// @ts-expect-error Ignore fixture modification
		payloadWithNullConclusion.workflow_run.conclusion = null;

		const zip = new AdmZip();
		const inputs: WorkflowInputs = { owner: 'target-org', repo: 'target-repo', sha: 'abc1234' };
		zip.addFile('inputs.json', Buffer.from(JSON.stringify(inputs)));
		const zipBuffer = zip.toBuffer();
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, { token: 'test', permissions: { actions: 'write' } })
			.get(`/repos/${owner}/${repo}/actions/runs/${payload.workflow_run.id}/artifacts`)
			.reply(200, { total_count: 1, artifacts: [{ id: 42, name: 'workflow-inputs' }] })
			.get(`/repos/${owner}/${repo}/actions/artifacts/42/zip`)
			.reply(200, zipBuffer, { 'Content-Type': 'application/zip' })
			.post('/repos/target-org/target-repo/check-runs', (body: unknown) => {
				expect(body).toStrictEqual({
					head_sha: 'abc1234',
					name: 'Dev Container Check',
					status: 'completed',
					conclusion: 'failure',
					details_url: payload.workflow_run.html_url,
					output: {
						title: 'Dev container configuration check failed.',
						summary: 'Check the workflow run details for more information.'
					}
				});
				return true;
			})
			.reply(201);

		// Act
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'workflow_run', payload: payloadWithNullConclusion });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});
});

// eslint-disable-next-line jsdoc/require-jsdoc
function createMockOctokit() {
	return {
		rest: {
			actions: {
				listWorkflowRunArtifacts: vi.fn(),
				downloadArtifact: vi.fn()
			}
		}
	} as unknown as ProbotOctokit;
}

describe('WorkflowRunCompletedHandler.downloadArtifactFileJSON', () => {
	it('returns null when matching artifact does not exist', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: { artifacts: [] }
		} as never);
		const handler = createHandler(octokit);

		// Act
		const result = await handler.download<{ owner: string }>({
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'inputs.json'
		});

		// Assert
		expect(result).toBeNull();
		expect(octokit.rest.actions.downloadArtifact).not.toHaveBeenCalled();
	});

	it('returns null when requested file is not present in artifact zip', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		const zip = new AdmZip();
		zip.addFile('different-file.json', Buffer.from('{"ok":true}'));
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);
		const handler = createHandler(octokit);

		// Act
		const result = await handler.download<{ owner: string }>({
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'inputs.json'
		});

		// Assert
		expect(result).toBeNull();
	});

	it('parses and returns JSON from requested file in artifact zip', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		const zip = new AdmZip();
		zip.addFile(
			'inputs.json',
			Buffer.from(JSON.stringify({ owner: 'target-org', repo: 'target-repo', ref: 'deadbeef' }))
		);
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);
		const handler = createHandler(octokit);

		// Act
		const result = await handler.download<{
			owner: string;
			repo: string;
			ref: string;
		}>({
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

	it('parses and returns JSON from requested file in subdirectory of artifact zip', async () => {
		// Arrange
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: {
				artifacts: [{ id: 42, name: 'workflow-inputs' }]
			}
		} as never);
		const zip = new AdmZip();
		zip.addFile(
			'subdirectory/inputs.json',
			Buffer.from(JSON.stringify({ owner: 'target-org', repo: 'target-repo', ref: 'deadbeef' }))
		);
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);
		const handler = createHandler(octokit);

		// Act
		const result = await handler.download<{
			owner: string;
			repo: string;
			ref: string;
		}>({
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'subdirectory/inputs.json'
		});

		// Assert
		expect(result).toStrictEqual({
			owner: 'target-org',
			repo: 'target-repo',
			ref: 'deadbeef'
		});
	});

	it('returns null when listWorkflowRunArtifacts throws', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockRejectedValue(
			new Error('network error')
		);
		const handler = createHandler(octokit);

		const result = await handler.download<{ owner: string }>({
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'inputs.json'
		});

		expect(result).toBeNull();
	});

	it('returns null when downloadArtifact throws', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: { artifacts: [{ id: 42, name: 'workflow-inputs' }] }
		} as never);
		vi.mocked(octokit.rest.actions.downloadArtifact).mockRejectedValue(
			new Error('download failed')
		);
		const handler = createHandler(octokit);

		const result = await handler.download<{ owner: string }>({
			owner: 'example-org',
			repo: 'runner-repo',
			workflowRunId: 123456789,
			artifactName: 'workflow-inputs',
			filePath: 'inputs.json'
		});

		expect(result).toBeNull();
	});

	it('throws when artifact file contains invalid JSON', async () => {
		const octokit = createMockOctokit();
		vi.mocked(octokit.rest.actions.listWorkflowRunArtifacts).mockResolvedValue({
			data: { artifacts: [{ id: 42, name: 'workflow-inputs' }] }
		} as never);
		const zip = new AdmZip();
		zip.addFile('inputs.json', Buffer.from('not valid json'));
		vi.mocked(octokit.rest.actions.downloadArtifact).mockResolvedValue({
			data: zip.toBuffer()
		} as never);
		const handler = createHandler(octokit);

		await expect(
			handler.download<{ owner: string }>({
				owner: 'example-org',
				repo: 'runner-repo',
				workflowRunId: 123456789,
				artifactName: 'workflow-inputs',
				filePath: 'inputs.json'
			})
		).rejects.toThrow('Failed to parse JSON content from artifact file');
	});
});
