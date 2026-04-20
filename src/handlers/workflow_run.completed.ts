import path from 'node:path';
import { Context } from 'probot';
import { AppConfig } from '../config.js';
import { downloadArtifactFileJSON } from '../octokit.js';
import { COMMIT_STATUS_CONTEXT } from './common.js';
import type { WorkflowInputs } from './types.js';

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

	// Only listen to workflow run completion events of the runner repository
	const repo = context.repo();
	if (
		repo.owner !== appConfig.RUNNER_REPOSITORY.owner ||
		repo.repo !== appConfig.RUNNER_REPOSITORY.repo ||
		// ? Match the workflow by file name instead of ID to allow users to customize the workflow file name
		path.basename(
			// * Workflow path could be null in some cases, but not clear under which circumstances.
			// * For now, we will treat null as non-matching workflow to avoid potential issues.
			payload.workflow?.path ?? ''
		) !== appConfig.CHECK_WORKFLOW_NAME
	) {
		log.debug(
			`Workflow run completed for ${payload.repository.full_name}, which does not match the configured runner repository. Ignoring event.`
		);
		return;
	}

	// Find artifact that contains the workflow inputs to determine which repository and ref this workflow run is associated with
	const inputs = await downloadArtifactFileJSON<WorkflowInputs>(octokit, {
		...appConfig.RUNNER_REPOSITORY,
		workflowRunId: payload.workflow_run.id,
		artifactName: appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME,
		filePath: appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH
	});
	if (!inputs) {
		log.error('Failed to retrieve workflow inputs.');
		return;
	}
	log.info(`Workflow run completed. Retrieved workflow inputs: ${JSON.stringify(inputs)}`);

	// Update the commit status based on the workflow run conclusion
	const targetRepo = { owner: inputs.owner, repo: inputs.repo };
	const state = payload.workflow_run.conclusion === 'success' ? 'success' : 'failure';
	await octokit.rest.repos.createCommitStatus({
		...targetRepo,
		sha: inputs.sha,
		state,
		context: COMMIT_STATUS_CONTEXT,
		description:
			state === 'success'
				? 'Dev container configuration is valid.'
				: 'Dev container configuration check failed.',
		target_url: payload.workflow_run.html_url
	});
	log.info(
		`Commit status updated based on workflow run conclusion: ${payload.workflow_run.conclusion}`
	);
}
