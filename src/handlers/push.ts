import type { ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { AppConfig, DEFAULT_BRANCH_ALIAS } from '../config.js';
import { isDevContainerFileChanged } from '../devcontainer.js';
import { branchNameFromRef } from '../git.js';
import { createWorkflowDispatch } from '../octokit.js';
import type { WorkflowInputs } from '../types.js';
import { matchPatterns } from '../utils.js';
import { COMMIT_STATUS_CONTEXT } from './common.js';

/** Helper type to extract the correct type for the files array in the response. */
type DiffEntries = Awaited<
	ReturnType<ProbotOctokit['rest']['repos']['compareCommitsWithBasehead']>
>['data']['files'];

/** Special GitHub ref value indicating a non-existent commit (e.g., for new branch creations or deletions) */
const GITHUB_NULL_SHA = '0000000000000000000000000000000000000000';

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
	const hasAssociatedPR = pullRequests.length > 0;
	if (hasAssociatedPR) {
		// If the push event is associated with a pull request, only trigger the workflow
		// when the base branch of the pull request matches the configured PR_BRANCHES.
		log.debug(
			`Push event is associated with ${pullRequests.length} pull request(s): ${pullRequests
				.map((pr) => `#${pr.number} (${pr.base.ref})`)
				.join(', ')}. Checking if any of the base branches match configured PR_BRANCHES...`
		);
		const isBaseBranchMatched = pullRequests.some((pr) => {
			const baseBranchName = pr.base.ref; // * Not refs/heads/ format, just the branch name
			return matchPatterns(baseBranchName, appConfig.PR_BRANCHES, {
				[DEFAULT_BRANCH_ALIAS]: defaultBranchName
			});
		});
		if (!isBaseBranchMatched) {
			log.debug(
				`No associated pull request found with base branch matching configured PR_BRANCHES: ${appConfig.PR_BRANCHES}. Ignoring event.`
			);
			return;
		}
	} else {
		// Only trigger the workflow if the push event is on a branch that matches the configured PUSH_BRANCHES.
		log.debug(
			`Push event is not associated with any pull request. Checking if branch matches configured PUSH_BRANCHES...`
		);
		const isBranchMatched = matchPatterns(branchName, appConfig.PUSH_BRANCHES, {
			[DEFAULT_BRANCH_ALIAS]: defaultBranchName
		});
		if (!isBranchMatched) {
			log.debug(
				`Branch ${branchName} does not match configured PUSH_BRANCHES: ${appConfig.PUSH_BRANCHES}. Ignoring event.`
			);
			return;
		}
	}

	let changedFiles: string[] = [];
	const before = isBranchCreated ? defaultBranchName : payload.before; // For new branches, compare with the default branch
	for await (const response of octokit.paginate.iterator(
		octokit.rest.repos.compareCommitsWithBasehead,
		{
			...repo,
			basehead: `${before}...${payload.after}`
		}
	)) {
		const { data: comparison } = response;
		changedFiles = changedFiles.concat(
			// @ts-expect-error The types for the response are not correctly inferred
			(comparison.files as DiffEntries)
				?.filter((f) => f.status !== 'unchanged')
				.map((f) => f.filename) ?? []
		);
	}

	// Check if any of the changed files are related to devcontainer configuration
	log.debug(`Checking ${changedFiles.length} changed files for devcontainer-related changes...`);
	if (!isDevContainerFileChanged(changedFiles)) {
		log.debug('No devcontainer-related file changes detected. Skipping workflow dispatch.');
		return;
	}

	// If devcontainer-related changes are detected, trigger the workflow dispatch event
	let runnerRef = appConfig.CHECK_WORKFLOW_REF;
	if (runnerRef === DEFAULT_BRANCH_ALIAS) {
		const { data: runnerRepoDetail } = await octokit.rest.repos.get({
			...appConfig.RUNNER_REPOSITORY
		});
		runnerRef = runnerRepoDetail.default_branch;
	}
	const inputs: WorkflowInputs = { ...repo, sha };
	log.info(
		'Devcontainer-related file change detected in this push.' +
			` Triggering workflow ${appConfig.CHECK_WORKFLOW_NAME} in ${appConfig.RUNNER_REPOSITORY.owner}/${appConfig.RUNNER_REPOSITORY.repo}@${runnerRef}` +
			` with inputs: ${JSON.stringify(inputs)}`
	);
	const workflowDispatchResult = await createWorkflowDispatch(octokit, {
		...appConfig.RUNNER_REPOSITORY,
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
