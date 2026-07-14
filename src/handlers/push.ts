import type { ProbotOctokit } from 'probot';
import { Context } from 'probot';
import { DEFAULT_BRANCH_ALIAS } from '../config.js';
import { isDevContainerFileChanged } from '../devcontainer.js';
import { branchNameFromRef } from '../git.js';
import { Repo } from '../types.js';
import { matchPatterns } from '../utils.js';
import { BaseHandler, CHECK_RUN_NAME } from './base.js';

/** Special GitHub ref value indicating a non-existent commit (e.g., for new branch creations or deletions) */
const GITHUB_NULL_SHA = '0000000000000000000000000000000000000000';

/** Helper type to extract the correct type for the files array in the response. */
type DiffEntries = Awaited<
	ReturnType<ProbotOctokit['rest']['repos']['compareCommitsWithBasehead']>
>['data']['files'];

/**
 * Handler for push events on the target repository.
 */
export default class PushHandler extends BaseHandler<Context<'push'>> {
	async handle() {
		const { payload } = this.context;
		const repo = this.repo();
		const defaultBranchName = payload.repository.default_branch;
		const ref = payload.ref;
		const sha = payload.after;

		this.log.debug(`Push handler triggered on: ${repo.toFullName()}@${ref}`);

		// Derived variables
		const isBranchCreated = payload.created || payload.before === GITHUB_NULL_SHA;
		const isBranchDeleted = payload.deleted || payload.after === GITHUB_NULL_SHA;
		const branchName = branchNameFromRef(ref);

		// Only process push events for branches (not tags or other refs)
		if (!branchName) {
			this.log.debug(`Ignoring non-branch ref: ${ref}.`);
			return;
		}

		// Ignore deletions
		if (isBranchDeleted) {
			this.log.debug(`Ignoring branch deletion event (${ref}).`);
			return;
		}

		// Check if the push event should be processed based on branch patterns
		const isBranchMatched = matchPatterns(branchName, this.appConfig.PUSH_BRANCHES, {
			[DEFAULT_BRANCH_ALIAS]: defaultBranchName
		});
		if (!isBranchMatched) {
			this.log.debug(
				`Branch ${branchName} does not match configured PUSH_BRANCHES: ${this.appConfig.PUSH_BRANCHES}. Ignoring event.`
			);
			return;
		}

		// Deduplication: if this commit is associated with an open PR that will be handled by the pull_request handler, skip it.
		const { data: pullRequests } =
			await this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
				...repo,
				commit_sha: sha
			});
		const relatedPR = pullRequests.find((pr) => {
			return (
				pr.state === 'open' &&
				matchPatterns(pr.base.ref, this.appConfig.PR_BRANCHES, {
					[DEFAULT_BRANCH_ALIAS]: defaultBranchName
				})
			);
		});
		if (relatedPR !== undefined) {
			this.log.debug(
				`Push commit is associated with an open PR (#${relatedPR.number}) matching PR_BRANCHES. Skipping push event to avoid duplicate checks.`
			);
			return;
		}

		// Get target repository visibility before comparing commits (optimization: skip compare if guardrail blocks)
		const targetRepoDetail = await this.octokit.rest.repos.get({ ...repo });
		const visibility = targetRepoDetail.data.visibility ?? 'private';
		const runnerRepo = this.getRunnerFor(repo, visibility as 'public' | 'private' | 'internal');
		if (!runnerRepo) {
			this.log.warn(
				`Unable to resolve runner repository for ${visibility} target repository ${repo.toFullName()}. Skipping workflow dispatch.`
			);
			return;
		}

		const before = isBranchCreated ? defaultBranchName : payload.before; // For new branches, compare with the default branch
		const changedFiles = await this.getChangedFiles(repo, `${before}...${payload.after}`);

		// Check if any of the changed files are related to devcontainer configuration
		this.log.debug(
			`Checking ${changedFiles.length} changed files for devcontainer-related changes...`
		);
		if (!isDevContainerFileChanged(changedFiles)) {
			this.log.debug('No devcontainer-related file changes detected. Skipping workflow dispatch.');
			await this.octokit.rest.checks.create({
				...repo,
				head_sha: sha,
				name: CHECK_RUN_NAME,
				status: 'completed',
				conclusion: 'success',
				output: {
					title: 'Dev container configuration did not change.',
					summary: `There were ${changedFiles.length} changed files, but none of them were related to devcontainer configuration.`
				}
			});
			return;
		}

		// If devcontainer-related changes are detected, trigger the workflow dispatch event
		await this.dispatchCheckWorkflow(repo, sha, runnerRepo);
	}

	/**
	 * Gets the list of changed files between two commits.
	 * @param repo Repository info with owner and repo name
	 * @param basehead The base..head reference string
	 * @returns Array of changed filenames
	 */
	private async getChangedFiles(repo: Repo, basehead: string): Promise<string[]> {
		const files: string[] = [];
		for await (const response of this.octokit.paginate.iterator(
			this.octokit.rest.repos.compareCommitsWithBasehead,
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
}
