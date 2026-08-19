import type { Logger } from 'pino';
import type { ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { AppConfig } from '../config.js';
import { Repo } from '../lib/github.js';

/**
 * Base class for webhook event handlers.
 *
 * Holds the shared event context (octokit, log, repo) and the application
 * configuration, and exposes the contextual utilities that were previously
 * threaded through the config object or duplicated across handlers.
 */
export abstract class BaseHandler<C extends Context = Context> {
	/** The Probot event context for the current webhook delivery. */
	protected readonly context: C;
	/** Validated application configuration. */
	protected readonly appConfig: AppConfig;
	/** Octokit instance bound to the installation that triggered the event. */
	protected readonly octokit: ProbotOctokit;
	/** Logger bound to the event. */
	protected readonly log: Logger;

	constructor(context: C, appConfig: AppConfig) {
		this.context = context;
		this.appConfig = appConfig;
		this.octokit = context.octokit;
		this.log = context.log;
	}

	/**
	 * Handle the webhook event. Implemented by concrete handler subclasses.
	 */
	abstract handle(): Promise<void>;

	/**
	 * Returns the owner/repo of the repository the event was delivered for.
	 * @returns The owner and repo of the event's repository
	 */
	protected repo(): Repo {
		return Repo.fromContext(this.context);
	}

	/**
	 * Resolves the runner repository to dispatch the check workflow to for the given
	 * target repository and its visibility.
	 *
	 * Public targets use `RUNNER_REPOSITORY`. Private or internal targets use
	 * `RUNNER_REPOSITORY_FOR_PRIVATE` when configured; when it is not set, a warning is logged
	 * and `null` is returned so the caller skips dispatching. The `RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE`
	 * toggle overrides this guardrail and dispatches private/internal targets to the public runner instead.
	 * @param repo The target repository the check is for
	 * @param visibility Visibility of the target repository ('public', 'private', or 'internal')
	 * @returns The resolved runner repository, or null if no runner is configured for the target
	 */
	public getRunnerFor(repo: Repo, visibility: 'public' | 'private' | 'internal'): Repo | null {
		const publicRunner = this.appConfig.RUNNER_REPOSITORY;
		if (visibility === 'public') {
			this.log.debug(
				`Resolved to public runner ${publicRunner.toFullName()} for target ${repo.toFullName()} (${visibility})`
			);
			return publicRunner;
		}

		// Private or internal target repository
		const privateRunner = this.appConfig.RUNNER_REPOSITORY_FOR_PRIVATE;
		if (privateRunner) {
			this.log.debug(
				`Resolved to private runner ${privateRunner.toFullName()} for target ${repo.toFullName()} (${visibility})`
			);
			return privateRunner;
		}

		// No private runner configured: fall back to the public runner when the guardrail is disabled.
		if (this.appConfig.RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE) {
			this.log.warn(
				`No private runner configured for target ${repo.toFullName()} (${visibility}); dispatching to the public runner (RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE).`
			);
			return this.appConfig.RUNNER_REPOSITORY;
		}

		this.log.warn(
			`No matching runner found for target ${repo.toFullName()} (${visibility}); set RUNNER_REPOSITORY_FOR_PRIVATE, or RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE, to enable checks for ${visibility} repositories.`
		);
		return null;
	}

	/**
	 * Checks if the given repository matches one of the configured runner repositories.
	 * @param repo Repository info with owner and repo name
	 * @returns true if the repo matches a configured runner repository
	 */
	public isRunnerRepo(repo: Repo): boolean {
		if (repo.equals(this.appConfig.RUNNER_REPOSITORY)) {
			return true;
		}

		if (
			this.appConfig.RUNNER_REPOSITORY_FOR_PRIVATE &&
			repo.equals(this.appConfig.RUNNER_REPOSITORY_FOR_PRIVATE)
		) {
			return true;
		}

		return false;
	}
}
