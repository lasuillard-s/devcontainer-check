import { Context } from 'probot';
import { AppConfig, DEFAULT_BRANCH_ALIAS } from '../config.js';
import { isDevContainerFileChanged } from '../devcontainer.js';
import { matchPatterns } from '../utils.js';
import { COMMIT_STATUS_CONTEXT, dispatchCheckWorkflow } from './common.js';

/**
 * Handler for pull_request events on the target repository.
 * @param context Event context
 * @param appConfig Application configuration
 */
export default async function handler(context: Context<'pull_request'>, appConfig: AppConfig) {
	const { payload, octokit, log } = context;
	const repo = context.repo();
	const pr = payload.pull_request;
	const sha = pr.head.sha;
	const baseBranchName = pr.base.ref;
	const defaultBranchName = payload.repository.default_branch;

	log.debug(`Pull request handler triggered on: ${repo.owner}/${repo.repo}#${pr.number}`);

	// Check if the PR event should be processed based on base branch patterns
	const isBranchMatched = matchPatterns(baseBranchName, appConfig.PR_BRANCHES, {
		[DEFAULT_BRANCH_ALIAS]: defaultBranchName
	});
	if (!isBranchMatched) {
		log.debug(
			`PR base branch ${baseBranchName} does not match configured PR_BRANCHES: ${appConfig.PR_BRANCHES}. Ignoring event.`
		);
		return;
	}

	// Get target repository visibility
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

	// Get changed files
	const files: string[] = [];
	for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
		...repo,
		pull_number: pr.number
	})) {
		files.push(...response.data.map((f) => f.filename));
	}

	log.debug(`Checking ${files.length} changed files for devcontainer-related changes...`);
	if (!isDevContainerFileChanged(files)) {
		log.debug('No devcontainer-related file changes detected. Skipping workflow dispatch.');
		await octokit.rest.checks.create({
			...repo,
			head_sha: sha,
			name: COMMIT_STATUS_CONTEXT,
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
	await dispatchCheckWorkflow({
		octokit,
		repo,
		sha,
		targetVisibility,
		appConfig,
		log
	});
}
