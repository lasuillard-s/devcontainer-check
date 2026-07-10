import type { Logger } from 'pino';
import type { ProbotOctokit } from 'probot';
import { AppConfig, DEFAULT_BRANCH_ALIAS } from '../config.js';
import { createWorkflowDispatch } from '../octokit.js';
import { Repo } from '../types.js';
import type { WorkflowInputs } from './types.js';

export const CHECK_RUN_NAME = 'Dev Container Check';

/**
 * Dispatches the check workflow to the runner repository.
 * @param params Parameters
 * @param params.appConfig Application configuration
 * @param params.octokit Octokit instance
 * @param params.log Logger
 * @param params.repo Repository info
 * @param params.sha SHA of the commit
 * @param params.targetVisibility Visibility of the runner repository
 */
export async function dispatchCheckWorkflow(params: {
	appConfig: AppConfig;
	octokit: ProbotOctokit;
	log: Logger;
	repo: Repo;
	sha: string;
	targetVisibility: string | undefined;
}): Promise<void> {
	const { appConfig, octokit, log, repo, sha, targetVisibility } = params;

	// Resolve runner repository
	const resolvedRunnerRepo = appConfig.resolveRunnerRepository(targetVisibility);
	log.debug(`Resolved runner repository: ${resolvedRunnerRepo.owner}/${resolvedRunnerRepo.repo}`);

	// Resolve runner workflow ref
	const resolvedRunnerRefRaw = appConfig.CHECK_WORKFLOW_REF;
	let runnerRef = resolvedRunnerRefRaw;
	if (runnerRef === DEFAULT_BRANCH_ALIAS) {
		const { data: runnerRepoDetail } = await octokit.rest.repos.get({
			...resolvedRunnerRepo
		});
		runnerRef = runnerRepoDetail.default_branch;
	}
	log.debug(`Resolved runner ref: ${runnerRef}`);

	// Dispatch check workflow
	const inputs: WorkflowInputs = { ...repo, sha };
	log.info(
		`Triggering workflow ${appConfig.CHECK_WORKFLOW_NAME} in ${resolvedRunnerRepo.owner}/${resolvedRunnerRepo.repo}@${runnerRef}` +
			` with inputs: ${JSON.stringify(inputs)}`
	);
	const workflowDispatchResult = await createWorkflowDispatch(octokit, {
		...resolvedRunnerRepo,
		workflow_id: appConfig.CHECK_WORKFLOW_NAME,
		ref: runnerRef,
		inputs: inputs as unknown as Record<string, unknown>,
		return_run_details: true
	});
	const workflowRunUrl = workflowDispatchResult?.html_url;

	// Create a check run in progress with a link to the workflow run
	await octokit.rest.checks.create({
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
	log.info('Workflow dispatch event created successfully.');
}
