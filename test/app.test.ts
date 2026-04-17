import AdmZip from 'adm-zip';
import fs from 'fs';
import nock from 'nock';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, vi } from 'vitest';
import type { WorkflowInputs } from '../src/types.js';
import { test } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('on push', () => {
	const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/push.json'), 'utf-8'));
	const installationId: number = payload.installation.id;

	beforeEach(() => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
		vi.stubEnv('CHECK_WORKFLOW_NAME', 'devcontainer-check.yaml');
		vi.stubEnv('CHECK_WORKFLOW_REF', undefined);
		vi.stubEnv('PUSH_BRANCHES', 'setup-devenv');
	});

	test('dispatches a workflow when devcontainer files are changed', async ({ probot }) => {
		// Arrange
		const workflowRunUrl = 'https://github.com/acme/devcontainer-check-runner/actions/runs/123';
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, {
				token: 'test',
				permissions: {
					actions: 'write'
				}
			})
			.get(`/repos/devcontainer-check-org/devcontainer-check/commits/${payload.after}/pulls`)
			.reply(200, [])
			.get(
				`/repos/devcontainer-check-org/devcontainer-check/compare/${payload.before}...${payload.after}`
			)
			.reply(200, {
				files: [
					{ filename: '.devcontainer.example/devcontainer.json', status: 'modified' },
					{ filename: '.devcontainer.example/onCreateCommand.sh', status: 'added' },
					{ filename: '.env.example', status: 'modified' }
				]
			})
			.get('/repos/acme/devcontainer-check-runner')
			.reply(200, { default_branch: 'main' })
			.post(
				'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches',
				(body: unknown) => {
					expect(body).toStrictEqual({
						ref: 'main',
						inputs: {
							owner: 'devcontainer-check-org',
							repo: 'devcontainer-check',
							sha: '197c4cb7a03609bffcce9962c8f36e67ed1a8419'
						},
						return_run_details: true
					});
					return true;
				}
			)
			.reply(201, {
				html_url: workflowRunUrl
			})
			.post(
				`/repos/devcontainer-check-org/devcontainer-check/statuses/${payload.after}`,
				(body: unknown) => {
					expect(body).toStrictEqual({
						state: 'pending',
						context: 'Dev Container Check',
						description: 'Checking for dev container configuration...',
						target_url: workflowRunUrl
					});
					return true;
				}
			)
			.reply(201);

		// Act
		await probot.receive({ id: '', name: 'push', payload });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	test('does not dispatch a workflow when no devcontainer files are changed', async ({
		probot
	}) => {
		// Arrange
		const payloadWithoutDevcontainerFiles = structuredClone(payload);
		payloadWithoutDevcontainerFiles.commits = payloadWithoutDevcontainerFiles.commits.map(
			(commit: { added: string[]; modified: string[]; removed: string[] }) => ({
				...commit,
				added: commit.added.filter((file) => !file.startsWith('.devcontainer')),
				modified: commit.modified.filter((file) => !file.startsWith('.devcontainer')),
				removed: commit.removed.filter((file) => !file.startsWith('.devcontainer'))
			})
		);
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, {
				token: 'test',
				permissions: {
					actions: 'write'
				}
			})
			.get(`/repos/devcontainer-check-org/devcontainer-check/commits/${payload.after}/pulls`)
			.reply(200, [])
			.get(
				`/repos/devcontainer-check-org/devcontainer-check/compare/${payload.before}...${payload.after}`
			)
			.reply(200, {
				files: [{ filename: 'package.json', status: 'modified' }]
			})
			.post(
				'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
			)
			.reply(204);

		// Act
		await probot.receive({ id: '', name: 'push', payload: payloadWithoutDevcontainerFiles });

		// Assert
		expect(mock.isDone()).toBe(false);
		expect(mock.pendingMocks()).toStrictEqual([
			'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
		]);
	});

	test('does not dispatch a workflow for tag pushes', async ({ probot }) => {
		// Arrange
		const tagPushPayload = {
			...payload,
			ref: 'refs/tags/v1.0.0'
		};
		const mock = nock('https://api.github.com')
			.post(
				'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
			)
			.reply(204);

		// Act
		await probot.receive({ id: '', name: 'push', payload: tagPushPayload });

		// Assert
		expect(mock.isDone()).toBe(false);
		expect(mock.pendingMocks()).toStrictEqual([
			'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
		]);
	});

	describe('when push has associated pull requests', () => {
		beforeEach(() => {
			vi.stubEnv('PR_BRANCHES', 'main');
		});

		test('dispatches a workflow when PR base branch matches PR_BRANCHES', async ({ probot }) => {
			// Arrange
			const workflowRunUrl = 'https://github.com/acme/devcontainer-check-runner/actions/runs/456';
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/devcontainer-check-org/devcontainer-check/commits/${payload.after}/pulls`)
				.reply(200, [{ base: { ref: 'main' } }])
				.get(
					`/repos/devcontainer-check-org/devcontainer-check/compare/${payload.before}...${payload.after}`
				)
				.reply(200, {
					files: [{ filename: '.devcontainer/devcontainer.json', status: 'modified' }]
				})
				.get('/repos/acme/devcontainer-check-runner')
				.reply(200, { default_branch: 'main' })
				.post(
					'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches',
					(body: unknown) => {
						expect(body).toStrictEqual({
							ref: 'main',
							inputs: {
								owner: 'devcontainer-check-org',
								repo: 'devcontainer-check',
								sha: payload.after
							},
							return_run_details: true
						});
						return true;
					}
				)
				.reply(201, { html_url: workflowRunUrl })
				.post(
					`/repos/devcontainer-check-org/devcontainer-check/statuses/${payload.after}`,
					(body: unknown) => {
						expect(body).toStrictEqual({
							state: 'pending',
							context: 'Dev Container Check',
							description: 'Checking for dev container configuration...',
							target_url: workflowRunUrl
						});
						return true;
					}
				)
				.reply(201);

			// Act
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		describe('when PR base branch does not match PR_BRANCHES', () => {
			beforeEach(() => {
				vi.stubEnv('PR_BRANCHES', 'release');
			});

			test('does not dispatch a workflow', async ({ probot }) => {
				// Arrange
				const mock = nock('https://api.github.com')
					.post(`/app/installations/${installationId}/access_tokens`)
					.reply(200, { token: 'test', permissions: { actions: 'write' } })
					.get(`/repos/devcontainer-check-org/devcontainer-check/commits/${payload.after}/pulls`)
					.reply(200, [{ base: { ref: 'main' } }])
					.post(
						'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
					)
					.reply(204);

				// Act
				await probot.receive({ id: '', name: 'push', payload });

				// Assert
				expect(mock.isDone()).toBe(false);
				expect(mock.pendingMocks()).toStrictEqual([
					'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
				]);
			});
		});
	});

	describe('when push has no associated pull requests', () => {
		beforeEach(() => {
			vi.stubEnv('PUSH_BRANCHES', 'main');
		});

		test('does not dispatch a workflow when branch does not match PUSH_BRANCHES', async ({
			probot
		}) => {
			// Arrange
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/devcontainer-check-org/devcontainer-check/commits/${payload.after}/pulls`)
				.reply(200, [])
				.post(
					'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
				)
				.reply(204);

			// Act
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(false);
			expect(mock.pendingMocks()).toStrictEqual([
				'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
			]);
		});
	});
});

describe('on workflow_run.completed', () => {
	const payload = JSON.parse(
		fs.readFileSync(path.join(__dirname, 'fixtures/workflow_run.completed.json'), 'utf-8')
	);
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
		const mock = nock('https://api.github.com')
			.get(`/repos/${owner}/${repo}/actions/runs/${payload.workflow_run.id}/artifacts`)
			.reply(200, { total_count: 0, artifacts: [] });

		// Act
		await probot.receive({ id: '', name: 'workflow_run', payload: payloadWithDifferentRepo });

		// Assert
		expect(mock.isDone()).toBe(false);
		expect(mock.pendingMocks()).toStrictEqual([
			`GET https://api.github.com:443/repos/${owner}/${repo}/actions/runs/${payload.workflow_run.id}/artifacts`
		]);
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
				.post('/repos/target-org/target-repo/statuses/abc1234', (body: unknown) => {
					expect(body).toStrictEqual({
						state: 'success',
						context: 'Dev Container Check',
						description: 'Dev container configuration is valid.',
						target_url: payload.workflow_run.html_url
					});
					return true;
				})
				.reply(201);

			// Act
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
				.post('/repos/target-org/target-repo/statuses/abc1234', (body: unknown) => {
					expect(body).toStrictEqual({
						state: 'failure',
						context: 'Dev Container Check',
						description: 'Dev container configuration check failed.',
						target_url: failedPayload.workflow_run.html_url
					});
					return true;
				})
				.reply(201);

			// Act
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
				.reply(200, { total_count: 0, artifacts: [] })
				.post('/repos/target-org/target-repo/statuses/abc1234')
				.reply(201);

			// Act
			await probot.receive({ id: '', name: 'workflow_run', payload });

			// Assert
			expect(mock.isDone()).toBe(false);
			expect(mock.pendingMocks()).toStrictEqual([
				'POST https://api.github.com:443/repos/target-org/target-repo/statuses/abc1234'
			]);
		});
	});
});
