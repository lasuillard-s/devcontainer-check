import { Context, Probot } from 'probot';
import { beforeEach, describe, expect, /* it, */ vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { BaseHandler } from '../../src/handlers/base.js';
import { Repo } from '../../src/octokit.js';
import { test as it } from '../helpers.js';

/**
 * Minimal concrete subclass used to exercise the shared helpers on BaseHandler.
 */
class TestHandler extends BaseHandler<Context> {
	public handleCalled = false;
	async handle(): Promise<void> {
		this.handleCalled = true;
	}
}

/**
 * Builds a TestHandler with the given environment variables loaded into config.
 * @param probot Probot app instance
 * @param payload Optional context payload override
 * @returns A TestHandler instance bound to a fake event context
 */
function makeHandler(probot: Probot, payload: unknown = {}): TestHandler {
	const config = loadConfig(probot);
	const context = {
		octokit: {} as Context['octokit'],
		log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		repo: () => ({ owner: 'owner', repo: 'repo' }),
		payload
	} as unknown as Context;
	return new TestHandler(context, config);
}

beforeEach(() => {
	vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
});

describe('BaseHandler.getRunnerFor', () => {
	beforeEach(() => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
	});

	it('returns the public runner for public target repositories', ({ probot }) => {
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'public')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('returns null for an internal target with no private runner configured', ({ probot }) => {
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toBeNull();
	});

	it('returns the configured private runner for private target repositories', ({ probot }) => {
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/private-runner');
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'private-runner')
		);
	});

	it('returns null when a private target has no private runner configured', ({ probot }) => {
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toBeNull();
	});

	it('uses the public runner for a private target when RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE is set', ({
		probot
	}) => {
		vi.stubEnv('RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE', 'true');
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('returns null for internal target with no private runner configured', ({ probot }) => {
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toBeNull();
	});

	it('returns the configured private runner for internal target repositories', ({ probot }) => {
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/private-runner');
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toEqual(
			new Repo('acme', 'private-runner')
		);
	});

	it('uses the public runner for an internal target when RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE is set', ({
		probot
	}) => {
		vi.stubEnv('RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE', 'true');
		const handler = makeHandler(probot);
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toEqual(
			new Repo('acme', 'runner')
		);
	});
});

describe('BaseHandler.isRunnerRepo', () => {
	beforeEach(() => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
	});

	it('matches the public runner repository', ({ probot }) => {
		const handler = makeHandler(probot);
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('other', 'runner'))).toBe(false);
	});

	it('matches the configured private runner repository', ({ probot }) => {
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/private-runner');
		const handler = makeHandler(probot);
		expect(handler.isRunnerRepo(new Repo('acme', 'private-runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('acme', 'unknown'))).toBe(false);
	});

	it('matches when both public and private runners are the same repository', ({ probot }) => {
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/runner');
		const handler = makeHandler(probot);
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
	});
});

describe('BaseHandler.getPrincipal', () => {
	it('returns null when payload has no recognizable account login', ({ probot }) => {
		const handler = makeHandler(probot, {});
		expect(handler.getPrincipal()).toBeNull();
	});

	it('returns null when account login is not a string or missing', ({ probot }) => {
		const handler = makeHandler(probot, { installation: { account: {} } });
		expect(handler.getPrincipal()).toBeNull();
	});

	it('returns lowercase login of the installation account', ({ probot }) => {
		const handler = makeHandler(probot, {
			installation: { account: { login: 'My-Org-User' } }
		});
		expect(handler.getPrincipal()).toBe('my-org-user');
	});

	it('returns lowercase login of the repository owner when installation account is not set', ({
		probot
	}) => {
		const handler = makeHandler(probot, {
			repository: { owner: { login: 'Repo-Owner-User' } }
		});
		expect(handler.getPrincipal()).toBe('repo-owner-user');
	});

	it('returns lowercase login of the organization when installation account and repo owner are not set', ({
		probot
	}) => {
		const handler = makeHandler(probot, {
			organization: { login: 'My-Org' }
		});
		expect(handler.getPrincipal()).toBe('my-org');
	});
});

describe('BaseHandler.isAuthorized', () => {
	it('returns true when ALLOWED_PRINCIPALS is "*"', ({ probot }) => {
		vi.stubEnv('ALLOWED_PRINCIPALS', '*');
		const handler = makeHandler(probot, {});
		expect(handler.isAuthorized()).toBe(true);
	});

	it('returns false when ALLOWED_PRINCIPALS is configured but principal cannot be determined', ({
		probot
	}) => {
		vi.stubEnv('ALLOWED_PRINCIPALS', 'org1,org2');
		const handler = makeHandler(probot, {});
		expect(handler.isAuthorized()).toBe(false);
	});

	it('returns true when principal is in ALLOWED_PRINCIPALS (case-insensitively)', ({ probot }) => {
		vi.stubEnv('ALLOWED_PRINCIPALS', 'ORG1,org2');
		const handler = makeHandler(probot, {
			installation: { account: { login: 'org1' } }
		});
		expect(handler.isAuthorized()).toBe(true);
	});

	it('returns false when principal is not in ALLOWED_PRINCIPALS', ({ probot }) => {
		vi.stubEnv('ALLOWED_PRINCIPALS', 'org1,org2');
		const handler = makeHandler(probot, {
			installation: { account: { login: 'other-org' } }
		});
		expect(handler.isAuthorized()).toBe(false);
	});
});

describe('BaseHandler.execute', () => {
	it('calls handle when authorized', async ({ probot }) => {
		vi.stubEnv('ALLOWED_PRINCIPALS', 'org1');
		const handler = makeHandler(probot, {
			installation: { account: { login: 'org1' } }
		});
		await handler.execute();
		expect(handler.handleCalled).toBe(true);
	});

	it('skips handle when unauthorized', async ({ probot }) => {
		vi.stubEnv('ALLOWED_PRINCIPALS', 'org1');
		const handler = makeHandler(probot, {
			installation: { account: { login: 'unauthorized-org' } }
		});
		await handler.execute();
		expect(handler.handleCalled).toBe(false);
	});
});
