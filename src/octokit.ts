import type { ProbotOctokit } from 'probot';

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
