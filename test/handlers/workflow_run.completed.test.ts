import AdmZip from 'adm-zip';
import nock from 'nock';
import { beforeEach, describe, expect, vi } from 'vitest';
import type { WorkflowInputs } from '../../src/handlers/types.js';
import payload from '../fixtures/workflow_run.completed.json' with { type: 'json' };
import { test } from '../helpers.js';

const installationId: number = payload.installation.id;
const owner: string = payload.repository.owner.login;
const repo: string = payload.repository.name;

beforeEach(() => {
	vi.stubEnv('RUNNER_REPOSITORY', 'example-org/runner-repo');
	vi.stubEnv('CHECK_WORKFLOW_NAME', 'devcontainer-check.yaml');
	vi.stubEnv('CHECK_WORKFLOW_REF', undefined);
});

test('ignores workflow run from non-runner repository', async ({ probot }) => {
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
	test('updates commit status to success when workflow run completes successfully', async ({
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
					name: 'devcontainer-check',
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

	test('updates commit status to failure when workflow run does not succeed', async ({
		probot
	}) => {
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
					name: 'devcontainer-check',
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

	test('logs error and skips status update when workflow inputs artifact is not found', async ({
		probot
	}) => {
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
});
