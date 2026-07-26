import AdmZip from 'adm-zip';
import path from 'node:path';
import { Context } from 'probot';
import { Repo } from '../octokit.js';
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

	/**
	 * Fetches and parses workflow inputs from a GitHub Actions artifact.
	 * @param repo Repository info with owner and repo name
	 * @param workflowRunId ID of the workflow run
	 * @returns The parsed workflow inputs, or null if retrieval failed
	 */
	private async fetchInputs(repo: Repo, workflowRunId: number): Promise<WorkflowInputs | null> {
		const artifactId = await this.findArtifactByName({
			repo,
			workflowRunId,
			artifactName: this.appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME
		});
		if (!artifactId) {
			this.log.error('Failed to find workflow inputs artifact.');
			return null;
		}
		const buffer = await this.downloadArtifactFile({
			repo,
			artifactId,
			filePath: this.appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH
		});
		if (!buffer) {
			this.log.error('Failed to download workflow inputs artifact file.');
			return null;
		}
		try {
			return JSON.parse(buffer.toString('utf-8')) as WorkflowInputs;
		} catch (error) {
			throw new Error(
				`Failed to parse workflow inputs from artifact file: ${errorToString(error)}`,
				{
					cause: error
				}
			);
		}
	}

	/**
	 * Finds a workflow run artifact by name.
	 * @param params Parameters for the artifact search
	 * @param params.repo Repository info with owner and repo name
	 * @param params.workflowRunId ID of the workflow run to get artifacts from
	 * @param params.artifactName Name of the artifact to find
	 * @returns The matching artifact ID, or null if not found
	 */
	protected async findArtifactByName(params: {
		repo: Repo;
		workflowRunId: number;
		artifactName: string;
	}): Promise<number | null> {
		const { repo, workflowRunId, artifactName } = params;
		let allArtifacts: { data: { artifacts: { id: number; name: string }[] } };
		try {
			const response = await this.octokit.rest.actions.listWorkflowRunArtifacts({
				owner: repo.owner,
				repo: repo.repo,
				run_id: workflowRunId
			});
			allArtifacts = response;
		} catch (error) {
			this.log.error(`Failed to list workflow run artifacts: ${errorToString(error)}`);
			return null;
		}
		return allArtifacts.data.artifacts.find((a) => a.name === artifactName)?.id ?? null;
	}

	/**
	 * Downloads an artifact zip and extracts the content of a specific file from it.
	 * @param params Parameters for the artifact download
	 * @param params.repo Repository info with owner and repo name
	 * @param params.artifactId ID of the artifact to download
	 * @param params.filePath Path to the file within the artifact to retrieve
	 * @returns The file content as a Buffer, or null if not found
	 */
	protected async downloadArtifactFile(params: {
		repo: Repo;
		artifactId: number;
		filePath: string;
	}): Promise<Buffer | null> {
		const { repo, artifactId, filePath } = params;
		let downloadResponse: { data: ArrayBuffer };
		try {
			const response = await this.octokit.rest.actions.downloadArtifact({
				owner: repo.owner,
				repo: repo.repo,
				artifact_id: artifactId,
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
		const buffer = Buffer.from(downloadResponse.data);
		const zip = new AdmZip(buffer);
		const file = zip.getEntries().find((entry) => entry.entryName === filePath);
		if (!file) {
			return null;
		}
		return file.getData();
	}
}
