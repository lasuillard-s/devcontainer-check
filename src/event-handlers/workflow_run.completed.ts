import path from 'node:path';
import { Context } from 'probot';
import { CHECK_RUN_NAME } from '../constants.js';
import { fetchInputs, Repo } from '../lib/github.js';
import { BaseHandler } from './base.js';

/**
 * Handler for workflow run completed events on the runner repository.
 */
export default class WorkflowRunCompletedHandler extends BaseHandler<
	Context<'workflow_run.completed'>
> {
	async handle() {
		const { payload } = this.context;
		const repo = this.repo();

		this.log.debug(
			`Workflow run completed handler triggered on: ${payload.repository.full_name}, workflow: ${payload.workflow_run.name}, conclusion: ${payload.workflow_run.conclusion}`
		);

		// Only listen to workflow run completion events of the runner repository
		const isRunnerRepo = this.isRunnerRepo(repo);

		// We check the filename (e.g., devcontainer-check.yaml) rather than a hardcoded ID for flexibility.
		const isTargetWorkflow =
			path.basename(
				// Workflow path could be null in some cases, but not clear under which circumstances.
				// For now, we will treat null as non-matching workflow to avoid potential issues.
				payload.workflow?.path ?? ''
			) === this.appConfig.CHECK_WORKFLOW_NAME;
		if (!isRunnerRepo || !isTargetWorkflow) {
			this.log.debug(
				`Workflow run completed for ${payload.repository.full_name}, which does not match the configured runner repository. Ignoring event.`
			);
			return;
		}

		// Find artifact that contains the workflow inputs to determine which repository and ref this workflow run is associated with
		const inputs = await fetchInputs(this.octokit, {
			repo,
			workflowRunId: payload.workflow_run.id,
			artifactName: this.appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME,
			artifactPath: this.appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH
		});
		if (!inputs) {
			return;
		}
		this.log.info(`Workflow run completed. Retrieved workflow inputs: ${JSON.stringify(inputs)}`);

		// Update the commit status based on the workflow run conclusion
		const targetRepo = new Repo(inputs.owner, inputs.repo);
		const state = payload.workflow_run.conclusion === 'success' ? 'success' : 'failure';
		await this.octokit.rest.checks.create({
			owner: targetRepo.owner,
			repo: targetRepo.repo,
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
		this.log.info(
			`Commit status updated based on workflow run conclusion: ${payload.workflow_run.conclusion}`
		);
	}
}
