import type { Logger } from 'pino';
import type { ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { AppConfig, DEFAULT_BRANCH_ALIAS } from '../config.js';
import { createWorkflowDispatch, Repo } from '../octokit.js';
import { errorToString } from '../utils.js';
import type { WorkflowInputs } from './types.js';

export const CHECK_RUN_NAME = 'Dev Container Check';

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
	 * and `null` is returned so the caller skips dispatching. The `USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES`
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
		if (this.appConfig.USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES) {
			this.log.warn(
				`No private runner configured for target ${repo.toFullName()} (${visibility}); dispatching to the public runner (USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES).`
			);
			return this.appConfig.RUNNER_REPOSITORY;
		}

		this.log.warn(
			`No matching runner found for target ${repo.toFullName()} (${visibility}); set RUNNER_REPOSITORY_FOR_PRIVATE, or USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES, to enable checks for ${visibility} repositories.`
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

	/**
	 * Dispatches the check workflow to the given runner repository and creates an in-progress check run.
	 * @param repo Repository info of the target repository
	 * @param sha SHA of the commit to check
	 * @param runnerRepo The runner repository to dispatch the workflow to
	 */
	protected async dispatchCheckWorkflow(repo: Repo, sha: string, runnerRepo: Repo): Promise<void> {
		// Resolve runner workflow ref
		const resolvedRunnerRefRaw = this.appConfig.CHECK_WORKFLOW_REF;
		let runnerRef = resolvedRunnerRefRaw;
		if (runnerRef === DEFAULT_BRANCH_ALIAS) {
			const { data: runnerRepoDetail } = await this.octokit.rest.repos.get({
				owner: runnerRepo.owner,
				repo: runnerRepo.repo
			});
			runnerRef = runnerRepoDetail.default_branch;
		}
		this.log.debug(`Resolved runner ref: ${runnerRef}`);

		const inputs: WorkflowInputs = { owner: repo.owner, repo: repo.repo, sha };
		this.log.info(
			`Triggering workflow ${this.appConfig.CHECK_WORKFLOW_NAME} in ${runnerRepo.toFullName()}@${runnerRef}` +
				` with inputs: ${JSON.stringify(inputs)}`
		);

		// Dispatch the workflow
		let workflowRunUrl: string | undefined;
		try {
			const workflowDispatchResult = await createWorkflowDispatch(this.octokit, {
				owner: runnerRepo.owner,
				repo: runnerRepo.repo,
				workflow_id: this.appConfig.CHECK_WORKFLOW_NAME,
				ref: runnerRef,
				inputs: inputs as unknown as Record<string, unknown>,
				return_run_details: true
			});
			workflowRunUrl = workflowDispatchResult?.html_url;
		} catch (error) {
			this.log.error(`Failed to dispatch workflow: ${errorToString(error)}`);
			await this.octokit.rest.checks.create({
				owner: repo.owner,
				repo: repo.repo,
				head_sha: sha,
				name: CHECK_RUN_NAME,
				status: 'completed',
				conclusion: 'failure',
				output: {
					title: 'Dev container configuration check failed to start.',
					summary: `Failed to dispatch the validation workflow: ${errorToString(error)}`
				}
			});
			return;
		}

		// Create a check run in progress with a link to the workflow run
		await this.octokit.rest.checks.create({
			owner: repo.owner,
			repo: repo.repo,
			head_sha: sha,
			name: CHECK_RUN_NAME,
			status: 'in_progress',
			details_url: workflowRunUrl,
			output: {
				title: 'Checking for dev container configuration...',
				summary: 'Check is in progress. This might take a few minutes.'
			}
		});
		this.log.info('Workflow dispatch event created successfully.');
	}
}
