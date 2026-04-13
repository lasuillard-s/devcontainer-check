import fs from 'fs';
import nock from 'nock';
import path from 'path';
import { Probot, ProbotOctokit } from 'probot';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const privateKey = fs.readFileSync(path.join(__dirname, 'fixtures/mock-cert.pem'), 'utf-8');

const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/push.json'), 'utf-8'));
const installationId: number = payload.installation.id;

describe('My Probot app', () => {
	let probot: Probot;

	beforeEach(() => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
		vi.stubEnv('CHECK_WORKFLOW_NAME', 'devcontainer-check.yaml');
		vi.stubEnv('CHECK_WORKFLOW_REF', undefined);
		probot = new Probot({
			appId: 123,
			privateKey,
			// Disable request throttling and retries for testing
			Octokit: ProbotOctokit.defaults({
				retry: { enabled: false },
				throttle: { enabled: false }
			})
		});
		probot.load(app);
	});

	test('dispatches a workflow when devcontainer files are changed', async () => {
		const mock = nock('https://api.github.com')
			.post(`/app/installations/${installationId}/access_tokens`)
			.reply(200, {
				token: 'test',
				permissions: {
					actions: 'write'
				}
			})
			.post(
				'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches',
				(body: unknown) => {
					expect(body).toStrictEqual({
						ref: 'main',
						inputs: {
							owner: 'devcontainer-check-org',
							repo: 'devcontainer-check',
							ref: 'refs/heads/setup-devenv'
						},
						return_run_details: true
					});
					return true;
				}
			)
			.reply(204, {
				html_url: ''
			})
			.post(
				`/repos/devcontainer-check-org/devcontainer-check/statuses/${payload.after}`,
				(body: unknown) => {
					expect(body).toStrictEqual({
						state: 'pending',
						context: 'Dev Container Check',
						description: 'Checking for dev container configuration...'
					});
					return true;
				}
			)
			.reply(201);

		await probot.receive({ id: '', name: 'push', payload });

		expect(mock.isDone()).toBe(true);
		expect(mock.pendingMocks()).toStrictEqual([]);
	});

	test('does not dispatch a workflow when no devcontainer files are changed', async () => {
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
			.post(
				'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
			)
			.reply(204);

		await probot.receive({ id: '', name: 'push', payload: payloadWithoutDevcontainerFiles });

		expect(mock.isDone()).toBe(false);
		expect(mock.pendingMocks()).toStrictEqual([
			'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
		]);
	});

	test('does not dispatch a workflow for tag pushes', async () => {
		const tagPushPayload = {
			...payload,
			ref: 'refs/tags/v1.0.0'
		};

		const mock = nock('https://api.github.com')
			.post(
				'/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
			)
			.reply(204);

		await probot.receive({ id: '', name: 'push', payload: tagPushPayload });

		expect(mock.isDone()).toBe(false);
		expect(mock.pendingMocks()).toStrictEqual([
			'POST https://api.github.com:443/repos/acme/devcontainer-check-runner/actions/workflows/devcontainer-check.yaml/dispatches'
		]);
	});
});
