import AdmZip from 'adm-zip';
import path from 'node:path';
import { Context } from 'probot';
import { Repo } from '../types.js';
import { errorToString } from '../utils.js';
import { BaseHandler, CHECK_RUN_NAME } from './base.js';
import type { WorkflowInputs } from './types.js';

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
		const inputs = await this.fetchInputs(repo, payload.workflow_run.id);
		if (!inputs) {
			return;
		}
		this.log.info(`Workflow run completed. Retrieved workflow inputs: ${JSON.stringify(inputs)}`);

		// Update the commit status based on the workflow run conclusion
		const targetRepo = new Repo(inputs.owner, inputs.repo);
		const state = payload.workflow_run.conclusion === 'success' ? 'success' : 'failure';
		await this.octokit.rest.checks.create({
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
		this.log.info(
			`Commit status updated based on workflow run conclusion: ${payload.workflow_run.conclusion}`
		);
	}

	/**
	 * Fetches and parses workflow inputs from a GitHub Actions artifact.
	 * @param repo Repository info with owner and repo name
	 * @param workflowRunId ID of the workflow run
	 * @returns The parsed workflow inputs, or null if retrieval failed
	 */
	private async fetchInputs(repo: Repo, workflowRunId: number): Promise<WorkflowInputs | null> {
		const inputs = await this.downloadArtifactFileJSON<WorkflowInputs>({
			...repo,
			workflowRunId,
			artifactName: this.appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME,
			filePath: this.appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH
		});
		if (!inputs) {
			this.log.error('Failed to retrieve workflow inputs.');
		}
		return inputs;
	}

	/**
	 * Downloads a specific artifact, extracts it in-memory, and retrieves the content of a specific
	 * file within the artifact, parsing it as JSON.
	 * @param params Parameters for the artifact download
	 * @param params.owner Repository owner
	 * @param params.repo Repository name
	 * @param params.workflowRunId ID of the workflow run to get artifacts from
	 * @param params.artifactName Name of the artifact to download
	 * @param params.filePath Path to the file within the artifact to retrieve and parse as JSON
	 * @returns The parsed content of the specified file within the artifact, or null if the artifact or file is not found
	 */
	protected async downloadArtifactFileJSON<ParseAs>(params: {
		owner: string;
		repo: string;
		workflowRunId: number;
		artifactName: string;
		filePath: string;
	}): Promise<ParseAs | null> {
		const { owner, repo, workflowRunId, artifactName, filePath } = params;

		// List artifacts for the workflow run and find the one with the specified name
		let allArtifacts: { data: { artifacts: { id: number; name: string }[] } };
		try {
			const response = await this.octokit.rest.actions.listWorkflowRunArtifacts({
				owner,
				repo,
				run_id: workflowRunId
			});
			allArtifacts = response;
		} catch (error) {
			this.log.error(`Failed to list workflow run artifacts: ${errorToString(error)}`);
			return null;
		}
		const artifact = allArtifacts.data.artifacts.find((a) => a.name === artifactName);
		if (!artifact) {
			return null;
		}

		// Download and extract the artifact to get the workflow inputs
		let downloadResponse: { data: ArrayBuffer };
		try {
			const response = await this.octokit.rest.actions.downloadArtifact({
				owner,
				repo,
				artifact_id: artifact.id,
				archive_format: 'zip',
				request: {
					redirect: 'follow'
				}
			});
			downloadResponse = response as unknown as { data: ArrayBuffer };
		} catch (error) {
			this.log.error(`Failed to download artifact: ${errorToString(error)}`);
			return null;
		}

		// Find the specified file in the artifact zip and parse its content as JSON
		const buffer = Buffer.from(downloadResponse.data);
		const zip = new AdmZip(buffer);
		const file = zip.getEntries().find((entry) => entry.entryName === filePath);
		if (!file) {
			return null;
		}
		const content = file.getData().toString('utf-8');
		try {
			return JSON.parse(content) as ParseAs;
		} catch (error) {
			throw new Error(`Failed to parse JSON content from artifact file: ${errorToString(error)}`, {
				cause: error
			});
		}
	}
}
