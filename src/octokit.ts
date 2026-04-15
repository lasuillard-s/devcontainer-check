import AdmZip from 'adm-zip';
import type { ProbotOctokit } from 'probot';
import { errorToString } from './utils.js';

export interface CreateWorkflowDispatchResult {
	html_url: string;
	run_url: string;
	workflow_run_id: number;
}

export async function createWorkflowDispatch(
	octokit: ProbotOctokit,
	params: Parameters<ProbotOctokit['rest']['actions']['createWorkflowDispatch']>[0] & {
		return_run_details: false;
	}
): Promise<undefined>;
export async function createWorkflowDispatch(
	octokit: ProbotOctokit,
	params: Parameters<ProbotOctokit['rest']['actions']['createWorkflowDispatch']>[0] & {
		return_run_details: true;
	}
): Promise<CreateWorkflowDispatchResult>;

/**
 * Wrapper around `octokit.rest.actions.createWorkflowDispatch` for better type safety.
 *
 * GitHub added new parameter `return_run_details` to the `createWorkflowDispatch` API
 * in February 2026, which allows returning the created workflow run details in the response.
 *
 * However, this change is not reflected in the current Octokit version used in this project,
 * so we need to create a wrapper function with proper TypeScript types to handle this new parameter and response structure.
 *
 * https://github.blog/changelog/2026-02-19-workflow-dispatch-api-now-returns-run-ids/
 * @param octokit Octokit instance to use for API calls
 * @param params Parameters for the workflow dispatch event,
 * 	including a custom `return_run_details` flag to indicate whether to return the created workflow run details.
 * @returns If `params.return_run_details` is true, returns an object of the created workflow run. Otherwise, returns undefined.
 */
export async function createWorkflowDispatch(
	octokit: ProbotOctokit,
	params: Parameters<ProbotOctokit['rest']['actions']['createWorkflowDispatch']>[0] & {
		return_run_details?: boolean;
	}
): Promise<CreateWorkflowDispatchResult | undefined> {
	const { data } = await octokit.rest.actions.createWorkflowDispatch(params);
	if (!params?.return_run_details) {
		return undefined;
	}
	return data as unknown as CreateWorkflowDispatchResult;
}

/**
 * Downloads a specific artifact, extracts it in-memory, and retrieves the content of a specific file within the artifact, parsing it as JSON.
 * @param octokit Octokit instance to use for API calls
 * @param params Parameters for the artifact download
 * @param params.owner Repository owner
 * @param params.repo Repository name
 * @param params.workflowRunId ID of the workflow run to get artifacts from
 * @param params.artifactName Name of the artifact to download
 * @param params.filePath Path to the file within the artifact to retrieve and parse as JSON
 * @returns The parsed content of the specified file within the artifact, or null if the artifact or file is not found
 */
export async function downloadArtifactFileJSON<ParseAs>(
	octokit: ProbotOctokit,
	params: {
		owner: string;
		repo: string;
		workflowRunId: number;
		artifactName: string;
		filePath: string;
	}
): Promise<ParseAs | null> {
	const { owner, repo, workflowRunId, artifactName, filePath } = params;

	// List artifacts for the workflow run and find the one with the specified name
	const allArtifacts = await octokit.rest.actions.listWorkflowRunArtifacts({
		owner,
		repo,
		run_id: workflowRunId
	});
	const artifact = allArtifacts.data.artifacts.find((a) => a.name === artifactName);
	if (!artifact) {
		return null;
	}

	// Download and extract the artifact to get the workflow inputs
	const { data } = (await octokit.rest.actions.downloadArtifact({
		owner,
		repo,
		artifact_id: artifact.id,
		archive_format: 'zip',
		request: {
			redirect: 'follow'
		}
	})) as unknown as { data: ArrayBuffer };

	// Find the specified file in the artifact zip and parse its content as JSON
	const buffer = Buffer.from(data);
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
