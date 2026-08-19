import type { Context } from 'probot';
import { describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../src/config.js';
import { BaseHandler } from '../../src/event-handlers/base.js';
import { Repo } from '../../src/lib/github.js';

/**
 * Minimal concrete subclass used to exercise the shared helpers on BaseHandler.
 */
class TestHandler extends BaseHandler<Context> {
	constructor(config: AppConfig) {
		const context = {
			log: {
				debug: vi.fn(),
				warn: vi.fn()
			}
		} as unknown as Context;
		super(context, config);
	}

	async handle(): Promise<void> {}
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
