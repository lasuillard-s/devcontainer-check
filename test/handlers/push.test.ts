import nock from 'nock';
import { beforeEach, describe, expect, vi } from 'vitest';
import payload from '../fixtures/push.json' with { type: 'json' };
import { test } from '../helpers.js';

const installationId: number = payload.installation.id;
const owner = payload.repository.owner.login;
const repo = payload.repository.name;
const repoFullName = payload.repository.full_name;
const after = payload.after;
const before = payload.before;

const runnerRepo = 'acme/devcontainer-check-runner';

beforeEach(() => {
	vi.stubEnv('RUNNER_REPOSITORY', runnerRepo);
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
		.get(`/repos/${repoFullName}/commits/${after}/pulls`)
		.reply(200, [])
		.get(`/repos/${repoFullName}`)
		.reply(200, { default_branch: 'main', visibility: 'public' })
		.get(`/repos/${repoFullName}/compare/${before}...${after}`)
		.reply(200, {
			files: [
				{ filename: '.devcontainer.example/devcontainer.json', status: 'modified' },
				{ filename: '.devcontainer.example/onCreateCommand.sh', status: 'added' },
				{ filename: '.env.example', status: 'modified' }
			]
		})
		.get(`/repos/${runnerRepo}`)
		.reply(200, { default_branch: 'main' })
		.post(
			`/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`,
			(body: unknown) => {
				expect(body).toStrictEqual({
					ref: 'main',
					inputs: {
						owner,
						repo,
						sha: after
					},
					return_run_details: true
				});
				return true;
			}
		)
		.reply(201, { html_url: workflowRunUrl })
		.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
			expect(body).toStrictEqual({
				head_sha: after,
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
		.get(`/repos/${repoFullName}/commits/${after}/pulls`)
		.reply(200, [])
		.get(`/repos/${repoFullName}`)
		.reply(200, { default_branch: 'main', visibility: 'public' })
		.get(`/repos/${repoFullName}/compare/${before}...${after}`)
		.reply(200, { files: [{ filename: 'package.json', status: 'modified' }] })
		.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
			expect(body).toStrictEqual({
				head_sha: after,
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
	await probot.receive({ id: '', name: 'push', payload: payloadWithoutDevcontainerFiles });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

test('on new branch creations, compare commits with default branch', async ({ probot }) => {
	// Arrange
	const newBranchPayload = structuredClone(payload);
	newBranchPayload.created = true;
	newBranchPayload.before = '0000000000000000000000000000000000000000';

	const workflowRunUrl = 'https://github.com/acme/devcontainer-check-runner/actions/runs/456';
	const mock = nock('https://api.github.com')
		.post(`/app/installations/${installationId}/access_tokens`)
		.reply(200, {
			token: 'test',
			permissions: {
				actions: 'write'
			}
		})
		.get(`/repos/${repoFullName}/commits/${after}/pulls`)
		.reply(200, [])
		.get(`/repos/${repoFullName}`)
		.reply(200, { default_branch: 'main', visibility: 'public' })
		.get(`/repos/${repoFullName}/compare/main...${after}`)
		.reply(200, {
			files: [{ filename: '.devcontainer/devcontainer.json', status: 'modified' }]
		})
		.get(`/repos/${runnerRepo}`)
		.reply(200, { default_branch: 'main' })
		.post(`/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`)
		.reply(201, { html_url: workflowRunUrl })
		.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
			expect(body).toStrictEqual({
				head_sha: after,
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
	await probot.receive({ id: '', name: 'push', payload: newBranchPayload });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
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
		.post(`/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`)
		.reply(204);

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'push', payload: deletedBranchPayload });

	// Assert
	expect(mock.isDone()).toBe(false);
	expect(mock.pendingMocks()).toStrictEqual([
		`POST https://api.github.com:443/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`
	]);
});

test('ignore tag pushes', async ({ probot }) => {
	// Arrange
	const tagPushPayload = {
		...payload,
		ref: 'refs/tags/v1.0.0'
	};
	const mock = nock('https://api.github.com');

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'push', payload: tagPushPayload });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

describe('deduplication when push has associated pull requests', () => {
	beforeEach(() => {
		vi.stubEnv('PR_BRANCHES', 'main');
	});

	test('skips dispatch when push commit is associated with an open PR matching PR_BRANCHES', async ({
		probot
	}) => {
		// Arrange
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, { token: 'test', permissions: { actions: 'write' } })
			.get(`/repos/${repoFullName}/commits/${after}/pulls`)
			.reply(200, [{ state: 'open', base: { ref: 'main' } }]);

		// Act
		// @ts-expect-error Ignore fixture modification
		await probot.receive({ id: '', name: 'push', payload });

		// Assert
		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	describe('when PR base branch does not match PR_BRANCHES or PR is closed', () => {
		beforeEach(() => {
			vi.stubEnv('PR_BRANCHES', 'release');
		});

		test('dispatches a workflow', async ({ probot }) => {
			// Arrange
			const workflowRunUrl = 'https://github.com/acme/devcontainer-check-runner/actions/runs/456';
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [{ state: 'open', base: { ref: 'main' } }]) // 'main' doesn't match 'release'
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'public' })
				.get(`/repos/${repoFullName}/compare/${before}...${after}`)
				.reply(200, {
					files: [{ filename: '.devcontainer/devcontainer.json', status: 'modified' }]
				})
				.get(`/repos/${runnerRepo}`)
				.reply(200, { default_branch: 'main' })
				.post(
					`/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`,
					(body: unknown) => {
						expect(body).toStrictEqual({
							ref: 'main',
							inputs: {
								owner,
								repo,
								sha: after
							},
							return_run_details: true
						});
						return true;
					}
				)
				.reply(201, { html_url: workflowRunUrl })
				.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: after,
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
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});
});

test('does not dispatch a workflow when branch does not match PUSH_BRANCHES', async ({
	probot
}) => {
	// Arrange
	const payloadWithDifferentBranch = structuredClone(payload);
	payloadWithDifferentBranch.ref = 'refs/heads/feature-branch';

	const mock = nock('https://api.github.com');
	// The PR query is skipped because branch mismatch fails early

	// Act
	// @ts-expect-error Ignore fixture modification
	await probot.receive({ id: '', name: 'push', payload: payloadWithDifferentBranch });

	// Assert
	expect(mock.isDone()).toBe(true);
	expect(mock.pendingMocks()).toStrictEqual([]);
});

describe('private repository runner selection', () => {
	describe('when only the public runner is configured', () => {
		beforeEach(() => {
			vi.stubEnv('RUNNER_REPOSITORY', 'acme/public-runner');
			vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', undefined);
			vi.stubEnv('USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES', undefined);
		});

		test('dispatches workflow for public repository', async ({ probot }) => {
			// Arrange
			const workflowRunUrl = 'https://github.com/acme/public-runner/actions/runs/123';
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'public' })
				.get(`/repos/${repoFullName}/compare/${before}...${after}`)
				.reply(200, {
					files: [{ filename: '.devcontainer.example/devcontainer.json', status: 'modified' }]
				})
				.get('/repos/acme/public-runner')
				.reply(200, { default_branch: 'main' })
				.post('/repos/acme/public-runner/actions/workflows/devcontainer-check.yaml/dispatches')
				.reply(201, { html_url: workflowRunUrl })
				.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: after,
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
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		test('skips workflow for private repository when no private runner is configured', async ({
			probot
		}) => {
			// Arrange
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'private' });

			// Act
			// @ts-expect-error Ignore fixture modification
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		describe('when USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES is true', () => {
			beforeEach(() => {
				vi.stubEnv('USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES', 'true');
			});

			test('dispatches workflow for private repository using the public runner', async ({
				probot
			}) => {
				// Arrange
				const workflowRunUrl = 'https://github.com/acme/public-runner/actions/runs/123';
				const mock = nock('https://api.github.com')
					.post(`/app/installations/${installationId}/access_tokens`)
					.reply(200, { token: 'test', permissions: { actions: 'write' } })
					.get(`/repos/${repoFullName}/commits/${after}/pulls`)
					.reply(200, [])
					.get(`/repos/${repoFullName}`)
					.reply(200, { default_branch: 'main', visibility: 'private' })
					.get(`/repos/${repoFullName}/compare/${before}...${after}`)
					.reply(200, {
						files: [{ filename: '.devcontainer.example/devcontainer.json', status: 'modified' }]
					})
					.get('/repos/acme/public-runner')
					.reply(200, { default_branch: 'main' })
					.post('/repos/acme/public-runner/actions/workflows/devcontainer-check.yaml/dispatches')
					.reply(201, { html_url: workflowRunUrl })
					.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
						expect(body).toStrictEqual({
							head_sha: after,
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
				await probot.receive({ id: '', name: 'push', payload });

				// Assert
				expect(mock.isDone()).toBe(true);
				expect(mock.pendingMocks()).toStrictEqual([]);
			});
		});
	});

	describe('repository visibility in push events', () => {
		test('treats undefined visibility as private/internal and skips when no private runner is configured', async ({
			probot
		}) => {
			// Arrange
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main' });

			// Act
			// @ts-expect-error Ignore fixture modification
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		test('handles compare response with undefined files', async ({ probot }) => {
			// Arrange
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'public' })
				.get(`/repos/${repoFullName}/compare/${before}...${after}`)
				.reply(200, {})
				.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: after,
						name: 'Dev Container Check',
						status: 'completed',
						conclusion: 'success',
						output: {
							title: 'Dev container configuration did not change.',
							summary:
								'There were 0 changed files, but none of them were related to devcontainer configuration.'
						}
					});
					return true;
				})
				.reply(201);

			// Act
			// @ts-expect-error Ignore fixture modification
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});

	describe('dispatchCheckWorkflow with explicit ref', () => {
		beforeEach(() => {
			vi.stubEnv('CHECK_WORKFLOW_REF', 'release-1');
		});

		test('dispatches workflow using explicit ref without fetching runner default branch', async ({
			probot
		}) => {
			// Arrange
			const workflowRunUrl = 'https://github.com/acme/devcontainer-check-runner/actions/runs/123';
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'public' })
				.get(`/repos/${repoFullName}/compare/${before}...${after}`)
				.reply(200, {
					files: [{ filename: '.devcontainer/devcontainer.json', status: 'modified' }]
				})
				.post(
					`/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`,
					(body: unknown) => {
						expect(body).toStrictEqual({
							ref: 'release-1',
							inputs: {
								owner,
								repo,
								sha: after
							},
							return_run_details: true
						});
						return true;
					}
				)
				.reply(201, { html_url: workflowRunUrl })
				.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: after,
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
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});

	describe('internal repository visibility', () => {
		beforeEach(() => {
			vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
			vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', undefined);
			vi.stubEnv('USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES', undefined);
		});

		test('skips workflow for internal repository when no private runner is configured', async ({
			probot
		}) => {
			// Arrange
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'internal' });

			// Act
			// @ts-expect-error Ignore fixture modification
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});

	describe('dispatch failure handling', () => {
		beforeEach(() => {
			vi.stubEnv('CHECK_WORKFLOW_REF', '~DEFAULT_BRANCH');
		});

		test('creates a failed check run when workflow dispatch throws', async ({ probot }) => {
			// Arrange
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'public' })
				.get(`/repos/${repoFullName}/compare/${before}...${after}`)
				.reply(200, {
					files: [{ filename: '.devcontainer/devcontainer.json', status: 'modified' }]
				})
				.get(`/repos/${runnerRepo}`)
				.reply(200, { default_branch: 'main' })
				.post(`/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`)
				.replyWithError({ code: 'ENOTFOUND', message: 'network error' })
				.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: after,
						name: 'Dev Container Check',
						status: 'completed',
						conclusion: 'failure',
						output: {
							title: 'Dev container configuration check failed to start.',
							summary: expect.stringContaining('Failed to dispatch the validation workflow')
						}
					});
					return true;
				})
				.reply(201);

			// Act
			// @ts-expect-error Ignore fixture modification
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});

	describe('when a private runner is configured', () => {
		beforeEach(() => {
			vi.stubEnv('RUNNER_REPOSITORY', 'acme/default-runner');
			vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/private-runner');
		});

		test('dispatches workflow for private repository using private runner', async ({ probot }) => {
			// Arrange
			const workflowRunUrl = 'https://github.com/acme/private-runner/actions/runs/123';
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'private' })
				.get(`/repos/${repoFullName}/compare/${before}...${after}`)
				.reply(200, {
					files: [{ filename: '.devcontainer.example/devcontainer.json', status: 'modified' }]
				})
				.get('/repos/acme/private-runner')
				.reply(200, { default_branch: 'main' })
				.post('/repos/acme/private-runner/actions/workflows/devcontainer-check.yaml/dispatches')
				.reply(201, { html_url: workflowRunUrl })
				.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: after,
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
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		test('dispatches workflow for public repository using default runner', async ({ probot }) => {
			// Arrange
			const workflowRunUrl = 'https://github.com/acme/default-runner/actions/runs/123';
			const mock = nock('https://api.github.com')
				.post(`/app/installations/${installationId}/access_tokens`)
				.reply(200, { token: 'test', permissions: { actions: 'write' } })
				.get(`/repos/${repoFullName}/commits/${after}/pulls`)
				.reply(200, [])
				.get(`/repos/${repoFullName}`)
				.reply(200, { default_branch: 'main', visibility: 'public' })
				.get(`/repos/${repoFullName}/compare/${before}...${after}`)
				.reply(200, {
					files: [{ filename: '.devcontainer.example/devcontainer.json', status: 'modified' }]
				})
				.get('/repos/acme/default-runner')
				.reply(200, { default_branch: 'main' })
				.post('/repos/acme/default-runner/actions/workflows/devcontainer-check.yaml/dispatches')
				.reply(201, { html_url: workflowRunUrl })
				.post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
					expect(body).toStrictEqual({
						head_sha: after,
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
			await probot.receive({ id: '', name: 'push', payload });

			// Assert
			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});
});
