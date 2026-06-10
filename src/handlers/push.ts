import type { ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { AppConfig, DEFAULT_BRANCH_ALIAS } from '../config.js';
import { isDevContainerFileChanged } from '../devcontainer.js';
import { branchNameFromRef } from '../git.js';
import { createWorkflowDispatch } from '../octokit.js';
import { matchPatterns } from '../utils.js';
import { COMMIT_STATUS_CONTEXT } from './common.js';
import type { WorkflowInputs } from './types.js';

/** Helper type to extract the correct type for the files array in the response. */
type DiffEntries = Awaited<
	ReturnType<ProbotOctokit['rest']['repos']['compareCommitsWithBasehead']>
>['data']['files'];

/** Special GitHub ref value indicating a non-existent commit (e.g., for new branch creations or deletions) */
const GITHUB_NULL_SHA = '0000000000000000000000000000000000000000';

type PushCheckResult = { matched: true } | { matched: false; reason: string };

/**
 * Determines if a push event should be processed based on branch patterns and pull request associations.
 * @param branchName The branch name from the push ref
 * @param defaultBranch The default branch of the repository
 * @param appConfig Application configuration
 * @param pullRequests Pull requests associated with the push commit
 * @returns object with matched status and reason for logging when not matched
 */
function shouldProcessPush(
	branchName: string,
	defaultBranch: string,
	appConfig: AppConfig,
	pullRequests: { number: number; base: { ref: string } }[]
): PushCheckResult {
	const hasAssociatedPR = pullRequests.length > 0;
	if (hasAssociatedPR) {
		const isBaseBranchMatched = pullRequests.some((pr) => {
			const baseBranchName = pr.base.ref;
			return matchPatterns(baseBranchName, appConfig.PR_BRANCHES, {
				[DEFAULT_BRANCH_ALIAS]: defaultBranch
			});
		});
		if (isBaseBranchMatched) {
			return { matched: true };
		}
		return {
			matched: false,
			reason: `No associated pull request found with base branch matching configured PR_BRANCHES: ${appConfig.PR_BRANCHES}. Ignoring event.`
		};
	}
	const isBranchMatched = matchPatterns(branchName, appConfig.PUSH_BRANCHES, {
		[DEFAULT_BRANCH_ALIAS]: defaultBranch
	});
	if (isBranchMatched) {
		return { matched: true };
	}
	return {
		matched: false,
		reason: `Branch ${branchName} does not match configured PUSH_BRANCHES: ${appConfig.PUSH_BRANCHES}. Ignoring event.`
	};
}

/**
 * Gets the list of changed files between two commits.
 * @param octokit Octokit instance
 * @param repo Repository info with owner and repo name
 * @param repo.owner Repository owner
 * @param repo.repo Repository name
 * @param basehead The base..head reference string
 * @returns Array of changed filenames
 */
async function getChangedFiles(
	octokit: ProbotOctokit,
	repo: { owner: string; repo: string },
	basehead: string
): Promise<string[]> {
	const files: string[] = [];
	for await (const response of octokit.paginate.iterator(
		octokit.rest.repos.compareCommitsWithBasehead,
		{
			...repo,
			basehead
		}
	)) {
		const { data: comparison } = response;
		files.push(
			// @ts-expect-error The types for the response are not correctly inferred
			...((comparison.files as DiffEntries)
				?.filter((f) => f.status !== 'unchanged')
				.map((f) => f.filename) ?? [])
		);
	}
	return files;
}

/**
 * Handler for push events on the target repository.
 * @param context Event context
 * @param appConfig Application configuration
 */
export default async function handler(context: Context<'push'>, appConfig: AppConfig) {
	const { payload, octokit, log } = context;
	const repo = context.repo();
	const defaultBranchName = payload.repository.default_branch;
	const ref = payload.ref;
	const sha = payload.after;

	log.debug(`Push handler triggered on: ${repo.owner}/${repo.repo}@${ref}`);

	// Derived variables
	const isBranchCreated = payload.created || payload.before === GITHUB_NULL_SHA;
	const isBranchDeleted = payload.deleted || payload.after === GITHUB_NULL_SHA;
	const branchName = branchNameFromRef(ref);

	// Only process push events for branches (not tags or other refs)
	if (!branchName) {
		log.debug(`Ignoring non-branch ref: ${ref}.`);
		return;
	}

	// Ignore deletions
	if (isBranchDeleted) {
		log.debug(`Ignoring branch deletion event (${ref}).`);
		return;
	}

	// Check if the push event should be processed based on associated pull requests and branch patterns
	const { data: pullRequests } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
		...repo,
		commit_sha: sha
	});
	const result = shouldProcessPush(branchName, defaultBranchName, appConfig, pullRequests);
	if (!result.matched) {
		log.debug(result.reason);
		return;
	}

	// Get target repository visibility before comparing commits (optimization: skip compare if guardrail blocks)
	const targetRepoDetail = await octokit.rest.repos.get({ ...repo });
	const targetVisibility = targetRepoDetail.data.visibility;
	const isPrivateDispatchBlocked =
		targetVisibility !== 'public' &&
		targetVisibility !== undefined &&
		!appConfig.RUNNER_REPOSITORY_DISABLE_GUARDRAIL &&
		!appConfig.RUNNER_REPOSITORY_FOR_PRIVATE;
	if (isPrivateDispatchBlocked) {
		log.info(
			'Target repository is private but no private runner is configured and guardrail is not disabled. Skipping workflow dispatch.'
		);
		return;
	}

	const before = isBranchCreated ? defaultBranchName : payload.before; // For new branches, compare with the default branch
	const changedFiles = await getChangedFiles(octokit, repo, `${before}...${payload.after}`);

	// Check if any of the changed files are related to devcontainer configuration
	log.debug(`Checking ${changedFiles.length} changed files for devcontainer-related changes...`);
	if (!isDevContainerFileChanged(changedFiles)) {
		log.debug('No devcontainer-related file changes detected. Skipping workflow dispatch.');
		await octokit.rest.repos.createCommitStatus({
			...repo,
			sha,
			state: 'success',
			context: COMMIT_STATUS_CONTEXT,
			description: 'Dev container configuration did not change.'
		});
		return;
	}

	// If devcontainer-related changes are detected, trigger the workflow dispatch event
	const resolvedRunnerRepo = appConfig.resolveRunnerRepository(targetVisibility);
	const resolvedRunnerRefRaw = appConfig.CHECK_WORKFLOW_REF;
	let runnerRef = resolvedRunnerRefRaw;
	if (runnerRef === DEFAULT_BRANCH_ALIAS) {
		const { data: runnerRepoDetail } = await octokit.rest.repos.get({
			...resolvedRunnerRepo
		});
		runnerRef = runnerRepoDetail.default_branch;
	}
	const inputs: WorkflowInputs = { ...repo, sha };
	log.info(
		'Devcontainer-related file change detected in this push.' +
			` Triggering workflow ${appConfig.CHECK_WORKFLOW_NAME} in ${resolvedRunnerRepo.owner}/${resolvedRunnerRepo.repo}@${runnerRef}` +
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

	// Update commit status to pending with a link to the workflow run
	await octokit.rest.repos.createCommitStatus({
		...repo,
		sha,
		state: 'pending',
		context: COMMIT_STATUS_CONTEXT,
		description: 'Checking for dev container configuration...',
		target_url: workflowRunUrl
	});
	log.info('Workflow dispatch event created successfully.');
}
