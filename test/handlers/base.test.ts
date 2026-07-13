import { Context, Probot } from 'probot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { BaseHandler } from '../../src/handlers/base.js';
import { Repo } from '../../src/types.js';

/**
 * Minimal concrete subclass used to exercise the shared helpers on BaseHandler.
 */
class TestHandler extends BaseHandler<Context> {
	/**
	 * @returns Resolves once the (no-op) event handling completes
	 */
	async handle(): Promise<void> {}
}

/**
 * Builds a TestHandler with the given environment variables loaded into config.
 * @param env Environment variables to stub before loading config
 * @returns A TestHandler instance bound to a fake event context
 */
function makeHandler(env: Record<string, string>): TestHandler {
	for (const [key, value] of Object.entries(env)) {
		vi.stubEnv(key, value);
	}
	const probot = {
		log: { error: vi.fn() }
	} as unknown as Probot;
	const config = loadConfig(probot);
	const context = {
		octokit: {} as Context['octokit'],
		log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		repo: () => ({ owner: 'owner', repo: 'repo' }),
		payload: {}
	} as unknown as Context;
	return new TestHandler(context, config);
}

describe('BaseHandler.getRunnerFor', () => {
	beforeEach(() => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
	});

	it('returns the public runner for public target repositories', () => {
		const handler = makeHandler({});
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'public')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('returns null for an internal target with no private runner configured', () => {
		const handler = makeHandler({});
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'internal')).toBeNull();
	});

	it('returns the configured private runner for private target repositories', () => {
		const handler = makeHandler({ RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner' });
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'private-runner')
		);
	});

	it('returns null when a private target has no private runner configured', () => {
		const handler = makeHandler({});
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toBeNull();
	});

	it('uses the public runner for a private target when USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES is set', () => {
		const handler = makeHandler({ USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES: 'true' });
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'runner')
		);
	});
});

describe('BaseHandler.isRunnerRepo', () => {
	beforeEach(() => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
	});

	it('matches the public runner repository', () => {
		const handler = makeHandler({});
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('other', 'runner'))).toBe(false);
	});

	it('matches the configured private runner repository', () => {
		const handler = makeHandler({ RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner' });
		expect(handler.isRunnerRepo(new Repo('acme', 'private-runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isRunnerRepo(new Repo('acme', 'unknown'))).toBe(false);
	});
});
