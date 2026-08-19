import AdmZip from 'adm-zip';
import type { Context, ProbotOctokit } from 'probot';
import { DEFAULT_BRANCH_ALIAS } from '../config.js';
import { CHECK_RUN_NAME } from '../constants.js';
import { errorToString } from '../utils/error.js';

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

/**
 * Finds a workflow run artifact by name.
 * @param octokit Octokit instance to use for API calls
 * @param params Parameters for the artifact search
 * @param params.repo Repository info with owner and repo name
 * @param params.workflowRunId ID of the workflow run to get artifacts from
 * @param params.artifactName Name of the artifact to find
 * @returns The matching artifact ID, or null if not found
 */
export async function findArtifactByName(
	octokit: ProbotOctokit,
	params: {
		repo: Repo;
		workflowRunId: number;
		artifactName: string;
	}
): Promise<number | null> {
	const { repo, workflowRunId, artifactName } = params;
	const response = await octokit.rest.actions.listWorkflowRunArtifacts({
		owner: repo.owner,
		repo: repo.repo,
		run_id: workflowRunId
	});
	return response.data.artifacts.find((a) => a.name === artifactName)?.id ?? null;
}

/**
 * Downloads an artifact zip and extracts the content of a specific file from it.
 * @param octokit Octokit instance to use for API calls
 * @param params Parameters for the artifact download
 * @param params.repo Repository info with owner and repo name
 * @param params.artifactId ID of the artifact to download
 * @param params.filePath Path to the file within the artifact to retrieve
 * @returns The file content as a Buffer, or null if not found
 */
export async function downloadArtifactFile(
	octokit: ProbotOctokit,
	params: {
		repo: Repo;
		artifactId: number;
		filePath: string;
	}
): Promise<Buffer | null> {
	const { repo, artifactId, filePath } = params;
	const response = (await octokit.rest.actions.downloadArtifact({
		owner: repo.owner,
		repo: repo.repo,
		artifact_id: artifactId,
		archive_format: 'zip',
		request: {
			redirect: 'follow'
		}
	})) as unknown as { data: ArrayBuffer };
	const buffer = Buffer.from(response.data);
	const zip = new AdmZip(buffer);
	const file = zip.getEntries().find((entry) => entry.entryName === filePath);
	if (!file) {
		return null;
	}
	return file.getData();
}

/**
 * Type definition for the expected structure of the workflow inputs artifact.
 *
 * These should match the inputs defined in `.github/workflows/devcontainer-check.yaml`
 */
export interface WorkflowInputs {
	owner: string;
	repo: string;
	sha: string;
}

/**
 * Fetches and parses workflow inputs from a GitHub Actions artifact.
 * @param octokit Octokit instance to use for API calls
 * @param params Parameters for the workflow inputs artifact fetch
 * @param params.repo Repository info with owner and repo name
 * @param params.workflowRunId ID of the workflow run
 * @param params.artifactName Name of the artifact containing workflow inputs
 * @param params.artifactPath Path to the inputs file within the artifact
 * @returns The parsed workflow inputs, or null if retrieval failed
 */
export async function fetchInputs(
	octokit: ProbotOctokit,
	params: {
		repo: Repo;
		workflowRunId: number;
		artifactName: string;
		artifactPath: string;
	}
): Promise<WorkflowInputs | null> {
	const { repo, workflowRunId, artifactName, artifactPath } = params;
	const artifactId = await findArtifactByName(octokit, {
		repo,
		workflowRunId,
		artifactName
	});
	if (artifactId === null) {
		return null;
	}
	const buffer = await downloadArtifactFile(octokit, {
		repo,
		artifactId,
		filePath: artifactPath
	});
	if (!buffer) {
		return null;
	}
	try {
		return JSON.parse(buffer.toString('utf-8')) as WorkflowInputs;
	} catch (error) {
		throw new Error(`Failed to parse workflow inputs from artifact file: ${errorToString(error)}`, {
			cause: error
		});
	}
}

/**
 * Dispatches the check workflow to the given runner repository and creates an in-progress check run.
 * @param context Probot event context
 * @param params Parameters for dispatching the check workflow
 * @param params.repo Repository info of the target repository
 * @param params.sha SHA of the commit to check
 * @param params.runnerRepo The runner repository to dispatch the workflow to
 * @param params.workflowName ID or filename of the workflow to trigger
 * @param params.workflowRef Reference for the workflow dispatch event
 * @param params.checkRunName Name of the check run to create. Defaults to CHECK_RUN_NAME.
 */
export async function dispatchCheckWorkflow(
	context: Readonly<Context>,
	params: {
		repo: Repo;
		sha: string;
		runnerRepo: Repo;
		workflowName: string;
		workflowRef: string;
		checkRunName?: string;
	}
): Promise<void> {
	const { octokit, log } = context;
	const {
		repo,
		sha,
		runnerRepo,
		workflowName,
		workflowRef: resolvedRunnerRefRaw,
		checkRunName = CHECK_RUN_NAME
	} = params;

	// Resolve runner workflow ref
	let runnerRef = resolvedRunnerRefRaw;
	if (runnerRef === DEFAULT_BRANCH_ALIAS) {
		const { data: runnerRepoDetail } = await octokit.rest.repos.get({
			owner: runnerRepo.owner,
			repo: runnerRepo.repo
		});
		runnerRef = runnerRepoDetail.default_branch;
	}
	log?.debug(`Resolved runner ref: ${runnerRef}`);

	const inputs: WorkflowInputs = { owner: repo.owner, repo: repo.repo, sha };
	log?.info(
		`Triggering workflow ${workflowName} in ${runnerRepo.toFullName()}@${runnerRef}` +
			` with inputs: ${JSON.stringify(inputs)}`
	);

	// Dispatch the workflow
	let workflowRunUrl: string | undefined;
	try {
		const workflowDispatchResult = await createWorkflowDispatch(octokit, {
			owner: runnerRepo.owner,
			repo: runnerRepo.repo,
			workflow_id: workflowName,
			ref: runnerRef,
			inputs: inputs as unknown as Record<string, unknown>,
			return_run_details: true
		});
		workflowRunUrl = workflowDispatchResult?.html_url;
	} catch (error) {
		log?.error(`Failed to dispatch workflow: ${errorToString(error)}`);
		await octokit.rest.checks.create({
			owner: repo.owner,
			repo: repo.repo,
			head_sha: sha,
			name: checkRunName,
			status: 'completed',
			conclusion: 'failure',
			output: {
				title: 'Dev container configuration check failed to start.',
				summary: `Failed to dispatch the validation workflow: ${errorToString(error)}`
			}
		});
		return;
	}

	// Create a check run in progress with a link to the workflow run
	await octokit.rest.checks.create({
		owner: repo.owner,
		repo: repo.repo,
		head_sha: sha,
		name: checkRunName,
		status: 'in_progress',
		details_url: workflowRunUrl,
		output: {
			title: 'Checking for dev container configuration...',
			summary: 'Check is in progress. This might take a few minutes.'
		}
	});
	log?.info('Workflow dispatch event created successfully.');
}
