import nock from 'nock';
import { beforeEach, describe, expect, vi } from 'vitest';
import createdPayload from '../fixtures/installation.created.json' with { type: 'json' };
import unsuspendPayload from '../fixtures/installation.unsuspend.json' with { type: 'json' };
import { test as it } from '../helpers.js';

describe('installation events access control', () => {
	const installationId = createdPayload.installation.id;

	describe('when ALLOWED_PRINCIPALS is not configured', () => {
		beforeEach(() => {
			vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
			vi.stubEnv('ALLOWED_PRINCIPALS', undefined);
		});

		it('allows installation on installation.created', async ({ probot }) => {
			const mock = nock('https://api.github.com');

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: createdPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		it('allows unsuspend on installation.unsuspend', async ({ probot }) => {
			const mock = nock('https://api.github.com');

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: unsuspendPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});

	describe('when ALLOWED_PRINCIPALS contains authorized principals', () => {
		beforeEach(() => {
			vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
			vi.stubEnv('ALLOWED_PRINCIPALS', 'lasuillard-s,another-org');
		});

		it('allows installation when principal is in ALLOWED_PRINCIPALS', async ({ probot }) => {
			const mock = nock('https://api.github.com');

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: createdPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		it('allows unsuspend when principal is in ALLOWED_PRINCIPALS', async ({ probot }) => {
			const mock = nock('https://api.github.com');

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: unsuspendPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});

	describe('when ALLOWED_PRINCIPALS differs only in case', () => {
		beforeEach(() => {
			vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
			vi.stubEnv('ALLOWED_PRINCIPALS', 'LASUILLARD-S');
		});

		it('allows installation matching case-insensitively', async ({ probot }) => {
			const mock = nock('https://api.github.com');

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: createdPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});

	describe('when principal is unauthorized', () => {
		beforeEach(() => {
			vi.stubEnv('RUNNER_REPOSITORY', 'acme/devcontainer-check-runner');
			vi.stubEnv('ALLOWED_PRINCIPALS', 'authorized-org-only');
		});

		it('uninstalls app on installation.created', async ({ probot }) => {
			const mock = nock('https://api.github.com')
				.delete(`/app/installations/${installationId}`)
				.reply(204);

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: createdPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		it('uninstalls app on installation.unsuspend', async ({ probot }) => {
			const mock = nock('https://api.github.com')
				.delete(`/app/installations/${installationId}`)
				.reply(204);

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: unsuspendPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		it('handles error gracefully when deleting installation fails', async ({ probot }) => {
			const mock = nock('https://api.github.com')
				.delete(`/app/installations/${installationId}`)
				.reply(500, { message: 'Internal Server Error' });

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: createdPayload });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});

		it('skips access control when account login is missing', async ({ probot }) => {
			const payloadWithoutLogin = structuredClone(createdPayload) as Record<string, unknown>;
			(payloadWithoutLogin.installation as Record<string, unknown>).account = null;

			const mock = nock('https://api.github.com');

			// @ts-expect-error Ignore fixture type mismatch
			await probot.receive({ id: '', name: 'installation', payload: payloadWithoutLogin });

			expect(mock.isDone()).toBe(true);
			expect(mock.pendingMocks()).toStrictEqual([]);
		});
	});
});
