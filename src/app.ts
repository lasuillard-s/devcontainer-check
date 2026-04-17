import path from 'node:path';
import type { ApplicationFunction, Context, ProbotOctokit } from 'probot';
import { type AppConfig, DEFAULT_BRANCH_ALIAS, loadConfig } from './config.js';
import { isDevContainerFileChanged } from './devcontainer.js';
import { isRefTag } from './git.js';
import { createWorkflowDispatch, downloadArtifactFileJSON } from './octokit.js';
import type { WorkflowInputs } from './types.js';

const COMMIT_STATUS_CONTEXT = 'Dev Container Check';

/** Helper type to extract the correct type for the files array in the response. */
type DiffEntries = Awaited<
	ReturnType<ProbotOctokit['rest']['repos']['compareCommitsWithBasehead']>
>['data']['files'];

/**
 * Parses the runner repository information from the application configuration.
 * @param config Application configuration
 * @returns An object containing the repository info
 */
function getRunnerRepo(config: AppConfig): { owner: string; repo: string } {
	const [owner, repo] = config.RUNNER_REPOSITORY.split('/');
	return { owner, repo };
}

export default ((app) => {
	const appConfig: AppConfig = loadConfig(app);

	// Push on target repository
	app.on('push', async (context: Context<'push'>) => {
		const { payload, octokit, log } = context;
		const repo = context.repo();
		const defaultBranchName = payload.repository.default_branch;
		log.debug(`Push handler triggered on: ${payload.repository.full_name}@${payload.ref}`);

		// Ignore tag pushes
		if (isRefTag(payload.ref)) {
			log.debug(`Tag push detected (${payload.ref}). Ignoring event.`);
			return;
		}

		// Collect all changed files from the push event
		let changedFiles: string[] = [];
		for await (const response of octokit.paginate.iterator(
			octokit.rest.repos.compareCommitsWithBasehead,
			{
				...repo,
				basehead: `${payload.before}...${payload.after}`
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
		const runnerRepo = getRunnerRepo(appConfig);
		const ref =
			appConfig.CHECK_WORKFLOW_REF === DEFAULT_BRANCH_ALIAS
				? defaultBranchName
				: appConfig.CHECK_WORKFLOW_REF;
		const inputs: WorkflowInputs = {
			...repo,
			sha: payload.after
		};
		log.info(
			'Devcontainer-related file change detected in this push.' +
				` Triggering workflow ${appConfig.CHECK_WORKFLOW_NAME} in ${runnerRepo.owner}/${runnerRepo.repo}@${ref}` +
				` with inputs: ${JSON.stringify(inputs)}`
		);
		const workflowDispatchResult = await createWorkflowDispatch(octokit, {
			...runnerRepo,
			workflow_id: appConfig.CHECK_WORKFLOW_NAME,
			ref,
			inputs: inputs as unknown as Record<string, unknown>,
			return_run_details: true
		});
		const workflowRunUrl = workflowDispatchResult?.html_url;

		// Update commit status to pending with a link to the workflow run
		await octokit.rest.repos.createCommitStatus({
			...repo,
			sha: payload.after,
			state: 'pending',
			context: COMMIT_STATUS_CONTEXT,
			description: 'Checking for dev container configuration...',
			target_url: workflowRunUrl
		});
		log.info('Workflow dispatch event created successfully.');
	});

	app.on('workflow_run.completed', async (context: Context<'workflow_run.completed'>) => {
		const { octokit, payload, log } = context;

		// Only listen to workflow run completion events of the runner repository
		const repo = context.repo();
		const runnerRepo = getRunnerRepo(appConfig);
		if (
			repo.owner !== runnerRepo.owner ||
			repo.repo !== runnerRepo.repo ||
			// ? Match the workflow by file name instead of ID to allow users to customize the workflow file name
			path.basename(
				// * Workflow path could be null in some cases, but not clear under which circumstances.
				// * For now, we will treat null as non-matching workflow to avoid potential issues.
				payload.workflow?.path ?? ''
			) !== appConfig.CHECK_WORKFLOW_NAME
		) {
			log.debug(
				`Workflow run completed for ${payload.repository.full_name}, which does not match the configured runner repository. Ignoring event.`
			);
			return;
		}

		// Find artifact that contains the workflow inputs to determine which repository and ref this workflow run is associated with
		const inputs = await downloadArtifactFileJSON<WorkflowInputs>(octokit, {
			owner: runnerRepo.owner,
			repo: runnerRepo.repo,
			workflowRunId: payload.workflow_run.id,
			artifactName: appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME,
			filePath: appConfig.CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH
		});
		if (!inputs) {
			log.error('Failed to retrieve workflow inputs.');
			return;
		}
		log.info(`Workflow run completed. Retrieved workflow inputs: ${JSON.stringify(inputs)}`);

		// Update the commit status based on the workflow run conclusion
		const targetRepo = { owner: inputs.owner, repo: inputs.repo };
		const state = payload.workflow_run.conclusion === 'success' ? 'success' : 'failure';
		await octokit.rest.repos.createCommitStatus({
			...targetRepo,
			sha: inputs.sha,
			state,
			context: COMMIT_STATUS_CONTEXT,
			description:
				state === 'success'
					? 'Dev container configuration is valid.'
					: 'Dev container configuration check failed.',
			target_url: payload.workflow_run.html_url
		});
		log.info(
			`Commit status updated based on workflow run conclusion: ${payload.workflow_run.conclusion}`
		);
	});
}) satisfies ApplicationFunction;
