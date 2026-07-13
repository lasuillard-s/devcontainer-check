import type { Logger } from 'pino';
import type { ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { AppConfig, DEFAULT_BRANCH_ALIAS } from '../config.js';
import { createWorkflowDispatch } from '../octokit.js';
import { Repo } from '../types.js';
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
	 * @returns Promise that resolves when the event has been handled
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
	 * A private target repository requires a private runner repository unless the guardrail
	 * is disabled; when no suitable runner is found, a warning is logged and `null` is returned
	 * so the caller can skip dispatching.
	 * @param repo The target repository the check is for
	 * @param targetVisibility Visibility of the target repository ('public', 'private', or undefined)
	 * @returns The resolved runner repository, or null if no runner matches (private protection)
	 */
	protected getRunnerFor(repo: Repo, targetVisibility: string | undefined): Repo | null {
		if (!targetVisibility || targetVisibility === 'public') {
			const runnerPublic = this.appConfig.RUNNER_REPOSITORY_FOR_PUBLIC;
			if (runnerPublic) return runnerPublic;
		}
		if (targetVisibility && targetVisibility !== 'public') {
			const runnerPrivate = this.appConfig.RUNNER_REPOSITORY_FOR_PRIVATE;
			if (runnerPrivate) return runnerPrivate;
		}
		const resolvedRunnerRepo = this.appConfig.RUNNER_REPOSITORY;
		if (
			targetVisibility !== 'public' &&
			targetVisibility !== undefined &&
			!this.appConfig.RUNNER_REPOSITORY_DISABLE_GUARDRAIL &&
			!this.appConfig.RUNNER_REPOSITORY_FOR_PRIVATE
		) {
			this.log.warn(
				`No matching runner repository found for private target ${repo.toFullName()}; dispatch blocked by guardrail.`
			);
			return null;
		}
		return resolvedRunnerRepo;
	}

	/**
	 * Checks if the given repository matches one of the configured runner repositories.
	 * @param repo Repository info with owner and repo name
	 * @returns true if the repo matches a configured runner repository
	 */
	protected isMatchingRunner(repo: Repo): boolean {
		const runnerRepositories = [this.appConfig.RUNNER_REPOSITORY];
		if (this.appConfig.RUNNER_REPOSITORY_FOR_PUBLIC) {
			runnerRepositories.push(this.appConfig.RUNNER_REPOSITORY_FOR_PUBLIC);
		}
		if (this.appConfig.RUNNER_REPOSITORY_FOR_PRIVATE) {
			runnerRepositories.push(this.appConfig.RUNNER_REPOSITORY_FOR_PRIVATE);
		}
		return runnerRepositories.some((runnerRepo) => runnerRepo.equals(repo));
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
				...runnerRepo
			});
			runnerRef = runnerRepoDetail.default_branch;
		}
		this.log.debug(`Resolved runner ref: ${runnerRef}`);

		// Dispatch check workflow
		const inputs: WorkflowInputs = { ...repo, sha };
		this.log.info(
			`Triggering workflow ${this.appConfig.CHECK_WORKFLOW_NAME} in ${runnerRepo.toFullName()}@${runnerRef}` +
				` with inputs: ${JSON.stringify(inputs)}`
		);
		const workflowDispatchResult = await createWorkflowDispatch(this.octokit, {
			...runnerRepo,
			workflow_id: this.appConfig.CHECK_WORKFLOW_NAME,
			ref: runnerRef,
			inputs: inputs as unknown as Record<string, unknown>,
			return_run_details: true
		});
		const workflowRunUrl = workflowDispatchResult?.html_url;

		// Create a check run in progress with a link to the workflow run
		await this.octokit.rest.checks.create({
			...repo,
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
