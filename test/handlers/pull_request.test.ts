import nock from 'nock';
import { beforeEach, describe, expect, vi } from 'vitest';
import pushPayload from '../fixtures/push.json' with { type: 'json' };
import { test } from '../helpers.js';

const installationId: number = pushPayload.installation.id;

const payload = {
	action: 'opened',
	number: 42,
	pull_request: {
		number: 42,
		head: {
			sha: pushPayload.after,
			ref: 'feature-branch'
		},
		base: {
			ref: 'main'
		}
	},
	repository: pushPayload.repository,
	installation: pushPayload.installation
};

beforeEach(() => {
	vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
	vi.stubEnv('CHECK_WORKFLOW_NAME', 'devcontainer-check.yaml');
	vi.stubEnv('CHECK_WORKFLOW_REF', undefined);
	vi.stubEnv('PR_BRANCHES', 'main');
});

test('dispatches a workflow when PR base branch matches PR_BRANCHES and devcontainer files are changed', async ({
	probot
}) => {
	// Arrange
	const workflowRunUrl = 'https://github.com/acme/devcontainer-check-runner/actions/runs/123';
	const mock = nock('https://api.github.com')
		.post(`/app/installations/${installationId}/access_tokens`)
		.reply(200, { token: 'test', permissions: { actions: 'write' } })
		.get('/repos/devcontainer-check-org/devcontainer-check')
		.reply(200, { default_branch: 'main', visibility: 'public' })
		.get(/\/repos\/devcontainer-check-org\/devcontainer-check\/pulls\/42\/files.*/)
		.reply(200, [
			{ filename: '.devcontainer.example/devcontainer.json' },
			{ filename: '.devcontainer.example/onCreateCommand.sh' },
			{ filename: '.env.example' }
		])
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
						sha: pushPayload.after
					},
					return_run_details: true
				});
				return true;
			}
		)
		.reply(201, { html_url: workflowRunUrl })
		.post(`/repos/devcontainer-check-org/devcontainer-check/check-runs`, (body: unknown) => {
			expect(body).toStrictEqual({
				head_sha: pushPayload.after,
				name: 'Dev Container Check',
				status: 'in_progress',
				details_url: workflowRunUrl,
				output: {
					title: 'Checking for dev container configuration...',
					summary: 'Check is in progress. This might take a few minutes.'
				}
			});
			return true;
		})
		.reply(201);

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'pull_request', payload });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

test('does not dispatch a workflow when no devcontainer files are changed', async ({ probot }) => {
	// Arrange
	const mock = nock('https://api.github.com')
		.post(`/app/installations/${installationId}/access_tokens`)
		.reply(200, { token: 'test', permissions: { actions: 'write' } })
		.get('/repos/devcontainer-check-org/devcontainer-check')
		.reply(200, { default_branch: 'main', visibility: 'public' })
		.get(/\/repos\/devcontainer-check-org\/devcontainer-check\/pulls\/42\/files.*/)
		.reply(200, [{ filename: 'package.json' }])
		.post(`/repos/devcontainer-check-org/devcontainer-check/check-runs`, (body: unknown) => {
			expect(body).toStrictEqual({
				head_sha: pushPayload.after,
				name: 'Dev Container Check',
				status: 'completed',
				conclusion: 'success',
				output: {
					title: 'Dev container configuration did not change.',
					summary: `There were 1 changed files, but none of them were related to devcontainer configuration.`
				}
			});
			return true;
		})
		.reply(201);

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'pull_request', payload });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

test('skips when PR base branch does not match PR_BRANCHES', async ({ probot }) => {
	// Arrange
	const payloadWithDifferentBase = structuredClone(payload);
	payloadWithDifferentBase.pull_request.base.ref = 'release';

	const mock = nock('https://api.github.com');
	// Fails early, no API calls

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'pull_request', payload: payloadWithDifferentBase });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

describe('private repository runner selection', () => {
	test('skips when no private runner is configured and the guardrail is enabled', async ({
		probot
	}) => {
		// Arrange
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, { token: 'test', permissions: { actions: 'write' } })
			.get('/repos/devcontainer-check-org/devcontainer-check')
			.reply(200, { default_branch: 'main', visibility: 'private' });
		// Should abort here

		// Act
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'pull_request', payload });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	describe('when USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES is true', () => {
		beforeEach(() => {
			vi.stubEnv('USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES', 'true');
		});

		test('dispatches to the public runner for private repositories', async ({ probot }) => {
			// Arrange
			const workflowRunUrl = 'https://github.com/acme/devcontainer-check-runner/actions/runs/123';
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get('/repos/devcontainer-check-org/devcontainer-check')
				.reply(200, { default_branch: 'main', visibility: 'private' })
				.get(/\/repos\/devcontainer-check-org\/devcontainer-check\/pulls\/42\/files.*/)
				.reply(200, [
					{ filename: '.devcontainer.example/devcontainer.json' },
					{ filename: '.devcontainer.example/onCreateCommand.sh' },
					{ filename: '.env.example' }
				])
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
								sha: pushPayload.after
							},
							return_run_details: true
						});
						return true;
					}
				)
				.reply(201, { html_url: workflowRunUrl })
				.post(`/repos/devcontainer-check-org/devcontainer-check/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: pushPayload.after,
						name: 'Dev Container Check',
						status: 'in_progress',
						details_url: workflowRunUrl,
						output: {
							title: 'Checking for dev container configuration...',
							summary: 'Check is in progress. This might take a few minutes.'
						}
					});
					return true;
				})
				.reply(201);

			// Act
			// @ts-expect-error Ignore fixture modification
			await probot.receive({ id: '', name: 'pull_request', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});
});
