import { Context } from 'probot';
import { DEFAULT_BRANCH_ALIAS } from '../config.js';
import { isDevContainerFileChanged } from '../devcontainer.js';
import { Repo } from '../types.js';
import { matchPatterns } from '../utils.js';
import { BaseHandler, CHECK_RUN_NAME } from './base.js';

/**
 * Handler for pull_request events on the target repository.
 */
export default class PullRequestHandler extends BaseHandler<Context<'pull_request'>> {
	async handle() {
		const { payload } = this.context;
		const repo = this.repo();
		const pr = payload.pull_request;
		const sha = pr.head.sha;
		const baseBranchName = pr.base.ref;
		const defaultBranchName = payload.repository.default_branch;

		this.log.debug(`Pull request handler triggered on: ${repo.toFullName()}#${pr.number}`);

		// Check if the PR event should be processed based on base branch patterns
		const isBranchMatched = matchPatterns(baseBranchName, this.appConfig.PR_BRANCHES, {
			[DEFAULT_BRANCH_ALIAS]: defaultBranchName
		});
		if (!isBranchMatched) {
			this.log.debug(
				`PR base branch ${baseBranchName} does not match configured PR_BRANCHES: ${this.appConfig.PR_BRANCHES}. Ignoring event.`
			);
			return;
		}

		// Get target repository visibility
		const targetRepoDetail = await this.octokit.rest.repos.get({ ...repo });
		const visibility = targetRepoDetail.data.visibility ?? 'public';
		const runnerRepo = this.getRunnerFor(repo, visibility as 'public' | 'private' | 'internal');
		if (!runnerRepo) {
			this.log.warn(
				`Unable to resolve runner repository for ${visibility} target repository ${repo.toFullName()}. Skipping workflow dispatch.`
			);
			return;
		}

		// Get changed files
		const files = await this.getChangedFiles(repo, pr.number);

		this.log.debug(`Checking ${files.length} changed files for devcontainer-related changes...`);
		if (!isDevContainerFileChanged(files)) {
			this.log.debug('No devcontainer-related file changes detected. Skipping workflow dispatch.');
			await this.octokit.rest.checks.create({
				...repo,
				head_sha: sha,
				name: CHECK_RUN_NAME,
				status: 'completed',
				conclusion: 'success',
				output: {
					title: 'Dev container configuration did not change.',
					summary: `There were ${files.length} changed files, but none of them were related to devcontainer configuration.`
				}
			});
			return;
		}

		// If devcontainer-related changes are detected, trigger the workflow dispatch event
		await this.dispatchCheckWorkflow(repo, sha, runnerRepo);
	}

	/**
	 * Gets the list of changed files for a pull request.
	 * @param repo Repository info with owner and repo name
	 * @param pullNumber Number of the pull request
	 * @returns Array of changed filenames
	 */
	private async getChangedFiles(repo: Repo, pullNumber: number): Promise<string[]> {
		const files: string[] = [];
		for await (const response of this.octokit.paginate.iterator(this.octokit.rest.pulls.listFiles, {
			...repo,
			pull_number: pullNumber
		})) {
			files.push(...response.data.map((f) => f.filename));
		}
		return files;
	}
}
