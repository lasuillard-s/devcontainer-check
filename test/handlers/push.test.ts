import nock from 'nock';
import { beforeEach, describe, expect, vi } from 'vitest';
import payload from '../fixtures/push.json' with { type: 'json' };
import { test } from '../helpers.js';

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
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'push', payload });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

test('does not dispatch a workflow when no devcontainer files are changed', async ({ probot }) => {
	// Arrange
	const payloadWithoutDevcontainerFiles = structuredClone(payload);
	// @ts-expect-error Ignore fixture modification
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
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'push', payload: payloadWithoutDevcontainerFiles });

	// Assert
	expect(mock.isDone()).toBe(false);
	expect(mock.pendingMocks()).toStrictEqual([
		'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
	]);
});

test('on new branch creations, use commits in payload to determine changed files', async ({
	probot
}) => {
	// Arrange
	const newBranchPayload = structuredClone(payload);
	newBranchPayload.created = true;
	newBranchPayload.before = '0000000000000000000000000000000000000000';
	newBranchPayload.ref = 'refs/heads/new-branch';

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
		.post(
			'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
		)
		.reply(204);

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'push', payload: newBranchPayload });

	// Assert
	expect(mock.isDone()).toBe(false);
	expect(mock.pendingMocks()).toStrictEqual([
		'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
	]);
});

test('ignore branch deletions', async ({ probot }) => {
	// Arrange
	const deletedBranchPayload = {
		...payload,
		deleted: true,
		after: '0000000000000000000000000000000000000000',
		ref: 'refs/heads/old-branch'
	};
	const mock = nock('https://api.github.com')
		.post(
			'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
		)
		.reply(204);

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'push', payload: deletedBranchPayload });

	// Assert
	expect(mock.isDone()).toBe(false);
	expect(mock.pendingMocks()).toStrictEqual([
		'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
	]);
});

test('ignore tag pushes', async ({ probot }) => {
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
	// @ts-expect-error Ignore fixture modification
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
		// @ts-expect-error Ignore fixture modification
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
			// @ts-expect-error Ignore fixture modification
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
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'push', payload });

		// Assert
		expect(mock.isDone()).toBe(false);
		expect(mock.pendingMocks()).toStrictEqual([
			'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
		]);
	});
});
