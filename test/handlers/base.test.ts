import { Probot } from 'probot';
import { Context } from 'probot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { Repo } from '../../src/types.js';
import { BaseHandler } from '../../src/handlers/base.js';

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

	it('resolves public runner repository for public target repos, falls back for private', () => {
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PUBLIC', 'acme/public-runner');

		const handler = makeHandler({ RUNNER_REPOSITORY_FOR_PUBLIC: 'acme/public-runner' });
		// Public target uses public runner
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'public')).toEqual(
			new Repo('acme', 'public-runner')
		);
		// Private target is blocked (no private runner configured)
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toBeNull();
	});

	it('resolves private runner repository for private target repos, falls back for public', () => {
		vi.stubEnv('RUNNER_REPOSITORY_FOR_PRIVATE', 'acme/private-runner');

		const handler = makeHandler({ RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner' });
		// Private target uses private runner
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'private-runner')
		);
		// Public target falls back to default runner
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'public')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('falls back to RUNNER_REPOSITORY for public targets and blocks private targets without a private runner', () => {
		const handler = makeHandler({});
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toBeNull();
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'public')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('returns null and logs a warning for a private target without a private runner (guardrail)', () => {
		const handler = makeHandler({});
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toBeNull();
		expect(handler.log.warn).toHaveBeenCalled();
	});

	it('does not block a private target when the guardrail is disabled', () => {
		const handler = makeHandler({ RUNNER_REPOSITORY_DISABLE_GUARDRAIL: 'true' });
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'runner')
		);
	});

	it('does not block a private target when a private runner is configured', () => {
		const handler = makeHandler({ RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner' });
		expect(handler.getRunnerFor(new Repo('owner', 'repo'), 'private')).toEqual(
			new Repo('acme', 'private-runner')
		);
	});
});

describe('BaseHandler.isMatchingRunner', () => {
	beforeEach(() => {
		vi.stubEnv('RUNNER_REPOSITORY', 'acme/runner');
	});

	it('matches the default runner repository', () => {
		const handler = makeHandler({});
		expect(handler.isMatchingRunner(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isMatchingRunner(new Repo('other', 'runner'))).toBe(false);
	});

	it('matches visibility-specific runner repositories', () => {
		const handler = makeHandler({
			RUNNER_REPOSITORY_FOR_PUBLIC: 'acme/public-runner',
			RUNNER_REPOSITORY_FOR_PRIVATE: 'acme/private-runner'
		});
		expect(handler.isMatchingRunner(new Repo('acme', 'public-runner'))).toBe(true);
		expect(handler.isMatchingRunner(new Repo('acme', 'private-runner'))).toBe(true);
		expect(handler.isMatchingRunner(new Repo('acme', 'runner'))).toBe(true);
		expect(handler.isMatchingRunner(new Repo('acme', 'unknown'))).toBe(false);
	});
});
