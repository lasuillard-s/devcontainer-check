import type { Context } from 'probot';
import { describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../src/config.js';
import { BaseHandler } from '../../src/event-handlers/base.js';
import { Repo } from '../../src/lib/github.js';

/**
 * Minimal concrete subclass used to exercise the shared helpers on BaseHandler.
 */
class TestHandler extends BaseHandler<Context> {
	public handleCalled = false;

	constructor(config: AppConfig, payload: unknown = {}) {
		const context = {
			log: {
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			},
			payload
		} as unknown as Context;
		super(context, config);
	}

	async handle(): Promise<void> {
		this.handleCalled = true;
	}
}

describe('BaseHandler.getRunnerFor', () => {
	const baseConfig = AppConfig.parse({
		RUNNER_REPOSITORY: 'acme/runner'
	});

	it('returns the public runner for public target repositories', () => {
		const handler = new TestHandler(baseConfig);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'public')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('returns null for an internal target with no private runner configured', () => {
		const handler = new TestHandler(baseConfig);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toBeNull();
	});

	it('returns the configured private runner for private target repositories', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner'
		});
		const handler = new TestHandler(config);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'private-runner')
		);
	});

	it('returns null when a private target has no private runner configured', () => {
		const handler = new TestHandler(baseConfig);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toBeNull();
	});

	it('uses the public runner for a private target when RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE is set', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE: 'true'
		});
		const handler = new TestHandler(config);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('returns null for internal target with no private runner configured', () => {
		const handler = new TestHandler(baseConfig);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toBeNull();
	});

	it('returns the configured private runner for internal target repositories', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner'
		});
		const handler = new TestHandler(config);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toEqual(
			new Repo('acme', 'private-runner')
		);
	});

	it('uses the public runner for an internal target when RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE is set', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE: 'true'
		});
		const handler = new TestHandler(config);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toEqual(
			new Repo('acme', 'runner')
		);
	});
});

describe('BaseHandler.isRunnerRepo', () => {
	const baseConfig = AppConfig.parse({
		RUNNER_REPOSITORY: 'acme/runner'
	});

	it('matches the public runner repository', () => {
		const handler = new TestHandler(baseConfig);
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('other', 'runner'))).toBe(false);
	});

	it('matches the configured private runner repository', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner'
		});
		const handler = new TestHandler(config);
		expect(handler.isRunnerRepo(new Repo('acme', 'private-runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('acme', 'unknown'))).toBe(false);
	});

	it('matches when both public and private runners are the same repository', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/runner'
		});
		const handler = new TestHandler(config);
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
	});
});

describe('BaseHandler.getPrincipal', () => {
	const baseConfig = AppConfig.parse({
		RUNNER_REPOSITORY: 'acme/runner'
	});

	it('returns null when payload has no recognizable account login', () => {
		const handler = new TestHandler(baseConfig, {});
		expect(handler.getPrincipal()).toBeNull();
	});

	it('returns null when account login is not a string or missing', () => {
		const handler = new TestHandler(baseConfig, { installation: { account: {} } });
		expect(handler.getPrincipal()).toBeNull();
	});

	it('returns lowercase login of the installation account', () => {
		const handler = new TestHandler(baseConfig, {
			installation: { account: { login: 'My-Org-User' } }
		});
		expect(handler.getPrincipal()).toBe('my-org-user');
	});

	it('returns lowercase login of the repository owner when installation account is not set', () => {
		const handler = new TestHandler(baseConfig, {
			repository: { owner: { login: 'Repo-Owner-User' } }
		});
		expect(handler.getPrincipal()).toBe('repo-owner-user');
	});

	it('returns lowercase login of the organization when installation account and repo owner are not set', () => {
		const handler = new TestHandler(baseConfig, {
			organization: { login: 'My-Org' }
		});
		expect(handler.getPrincipal()).toBe('my-org');
	});
});

describe('BaseHandler.isAuthorized', () => {
	it('returns true when ALLOWED_PRINCIPALS is "*"', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			ALLOWED_PRINCIPALS: '*'
		});
		const handler = new TestHandler(config, {});
		expect(handler.isAuthorized()).toBe(true);
	});

	it('returns false when ALLOWED_PRINCIPALS is configured but principal cannot be determined', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			ALLOWED_PRINCIPALS: 'org1,org2'
		});
		const handler = new TestHandler(config, {});
		expect(handler.isAuthorized()).toBe(false);
	});

	it('returns true when principal is in ALLOWED_PRINCIPALS (case-insensitively)', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			ALLOWED_PRINCIPALS: 'ORG1,org2'
		});
		const handler = new TestHandler(config, {
			installation: { account: { login: 'org1' } }
		});
		expect(handler.isAuthorized()).toBe(true);
	});

	it('returns false when principal is not in ALLOWED_PRINCIPALS', () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			ALLOWED_PRINCIPALS: 'org1,org2'
		});
		const handler = new TestHandler(config, {
			installation: { account: { login: 'other-org' } }
		});
		expect(handler.isAuthorized()).toBe(false);
	});
});

describe('BaseHandler.execute', () => {
	it('calls handle when authorized', async () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			ALLOWED_PRINCIPALS: 'org1'
		});
		const handler = new TestHandler(config, {
			installation: { account: { login: 'org1' } }
		});
		await handler.execute();
		expect(handler.handleCalled).toBe(true);
	});

	it('skips handle when unauthorized', async () => {
		const config = AppConfig.parse({
			RUNNER_REPOSITORY: 'acme/runner',
			ALLOWED_PRINCIPALS: 'org1'
		});
		const handler = new TestHandler(config, {
			installation: { account: { login: 'unauthorized-org' } }
		});
		await handler.execute();
		expect(handler.handleCalled).toBe(false);
	});
});
