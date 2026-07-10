import path from 'node:path';
import type { ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { AppConfig } from '../config.js';
import { downloadArtifactFileJSON } from '../octokit.js';
import { CHECK_RUN_NAME } from './common.js';
import type { WorkflowInputs } from './types.js';

/**
 * Checks if the current repository matches one of the configured runner repositories.
 * @param repo Repository info with owner and repo name
 * @param repo.owner Repository owner
 * @param repo.repo Repository name
 * @param appConfig Application configuration
 * @returns true if the repo matches a configured runner repository
 */
function isMatchingRunner(repo: { owner: string; repo: string }, appConfig: AppConfig): boolean {
	const runnerRepositories = [appConfig.RUNNER_REPOSITORY];
	if (appConfig.RUNNER_REPOSITORY_FOR_PUBLIC) {
		runnerRepositories.push(appConfig.RUNNER_REPOSITORY_FOR_PUBLIC);
	}
	if (appConfig.RUNNER_REPOSITORY_FOR_PRIVATE) {
		runnerRepositories.push(appConfig.RUNNER_REPOSITORY_FOR_PRIVATE);
	}
	return runnerRepositories.some(
		(runnerRepo) => runnerRepo.owner === repo.owner && runnerRepo.repo === repo.repo
	);
}

/**
 * Fetches and parses workflow inputs from a GitHub Actions artifact.
 * @param octokit Octokit instance
 * @param repo Repository info with owner and repo name
 * @param repo.owner Repository owner
 * @param repo.repo Repository name
 * @param workflowRunId ID of the workflow run
 * @param appConfig Application configuration
 * @param log Logger instance for error logging
 * @param log.error Error logging function
 * @returns The parsed workflow inputs, or null if retrieval failed
 */
async function fetchInputs(
	octokit: ProbotOctokit,
	repo: { owner: string; repo: string },
	workflowRunId: number,
	appConfig: AppConfig,
	log: { error: (msg: string) => void }
): Promise<WorkflowInputs | null> {
	const inputs = await downloadArtifactFileJSON<WorkflowInputs>(octokit, {
		...repo,
		workflowRunId,
		artifactName: appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME,
		filePath: appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH
	});
	if (!inputs) {
		log.error('Failed to retrieve workflow inputs.');
	}
	return inputs;
}

/**
 * Handler for workflow run completed events on the runner repository.
 * @param context Event context
 * @param appConfig Application configuration
 */
export default async function handler(
	context: Context<'workflow_run.completed'>,
	appConfig: AppConfig
) {
	const { octokit, payload, log } = context;
	const repo = context.repo();

	log.debug(
		`Workflow run completed handler triggered on: ${payload.repository.full_name}, workflow: ${payload.workflow_run.name}, conclusion: ${payload.workflow_run.conclusion}`
	);

	// Only listen to workflow run completion events of the runner repository
	const isMatchingRunnerRepository = isMatchingRunner(repo, appConfig);
	// We check the filename (e.g., devcontainer-check.yaml) rather than a hardcoded ID for flexibility.
	const isTargetWorkflow =
		path.basename(
			// Workflow path could be null in some cases, but not clear under which circumstances.
			// For now, we will treat null as non-matching workflow to avoid potential issues.
			payload.workflow?.path ?? ''
		) === appConfig.CHECK_WORKFLOW_NAME;
	if (!isMatchingRunnerRepository || !isTargetWorkflow) {
		log.debug(
			`Workflow run completed for ${payload.repository.full_name}, which does not match the configured runner repository. Ignoring event.`
		);
		return;
	}

	// Find artifact that contains the workflow inputs to determine which repository and ref this workflow run is associated with
	const inputs = await fetchInputs(octokit, repo, payload.workflow_run.id, appConfig, log);
	if (!inputs) {
		return;
	}
	log.info(`Workflow run completed. Retrieved workflow inputs: ${JSON.stringify(inputs)}`);

	// Update the commit status based on the workflow run conclusion
	const targetRepo = { owner: inputs.owner, repo: inputs.repo };
	const state = payload.workflow_run.conclusion === 'success' ? 'success' : 'failure';
	await octokit.rest.checks.create({
		...targetRepo,
		head_sha: inputs.sha,
		name: CHECK_RUN_NAME,
		status: 'completed',
		conclusion: state,
		details_url: payload.workflow_run.html_url,
		output: {
			title:
				state === 'success'
					? 'Dev container configuration is valid.'
					: 'Dev container configuration check failed.',
			summary: 'Check the workflow run details for more information.'
		}
	});
	log.info(
		`Commit status updated based on workflow run conclusion: ${payload.workflow_run.conclusion}`
	);
}
