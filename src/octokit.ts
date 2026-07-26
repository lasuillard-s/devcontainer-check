import type { ProbotOctokit } from 'probot';
/** Minimal shape of a Probot event context needed to derive the current repository. */
interface ContextRepoProvider {
	repo: () => { owner: string; repo: string };
}

export class Repo {
	constructor(
		public readonly owner: string,
		public readonly repo: string
	) {}

	/**
	 * Parses a repository full name in `owner/repo` format into a Repo.
	 * @param fullName Repository full name
	 * @returns The parsed Repo
	 */
	static fromFullName(fullName: string): Repo {
		const [owner, repo] = fullName.split('/');
		return new Repo(owner, repo);
	}

	/**
	 * Creates a Repo from a Probot event context.
	 * @param context Event context that exposes the repository helper
	 * @returns The Repo for the event's repository
	 */
	static fromContext(context: ContextRepoProvider): Repo {
		const { owner, repo } = context.repo();
		return new Repo(owner, repo);
	}

	/**
	 * Returns the `owner/repo` full name of the repository.
	 * @returns The full name in `owner/repo` format
	 */
	toFullName(): string {
		return `${this.owner}/${this.repo}`;
	}

	/**
	 * Checks if this repository equals another by owner and repo.
	 * @param other The repository to compare with
	 * @returns True if both owner and repo match
	 */
	equals(other: Repo): boolean {
		return this.owner === other.owner && this.repo === other.repo;
	}
}

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
