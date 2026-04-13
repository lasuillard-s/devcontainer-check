import AdmZip from 'adm-zip';
import type { ApplicationFunction, Context } from 'probot';
import { type AppConfig, loadConfig } from './config.js';
import { isDevContainerFileChanged } from './devcontainer.js';
import { createWorkflowDispatch } from './octokit.js';

const COMMIT_STATUS_CONTEXT = 'Dev Container Check';

export default ((app) => {
	const appConfig: AppConfig = loadConfig(app);

	app.on('push', async (context: Context<'push'>) => {
		const { payload, octokit } = context;
		context.log.debug(`Push handler triggered on: ${payload.repository.full_name}@${payload.ref}`);

		// Ignore tag pushes
		if (payload.ref.startsWith('refs/tags/')) {
			context.log.debug(`Tag push detected (${payload.ref}). Ignoring event.`);
			return;
		}

		// Collect all changed files from the push event
		const changedFiles = new Set<string>();
		for (const commit of payload.commits ?? []) {
			const { added, modified, removed } = commit;
			for (const file of [...added, ...modified, ...removed]) {
				changedFiles.add(file);
			}
		}
		const files = [...changedFiles];

		// Check if any of the changed files are related to devcontainer configuration
		const targetRepoOwner = payload.repository.owner.login;
		const targetRepoName = payload.repository.name;
		const targetRef = payload.ref;

		context.log.debug(`Checking ${files.length} changed files for devcontainer-related changes...`);
		if (!isDevContainerFileChanged(context, files)) {
			context.log.debug(
				'No devcontainer-related file changes detected. Skipping workflow dispatch.'
			);
			return;
		}

		// If devcontainer-related changes are detected, trigger the workflow dispatch event
		const [runnerRepoOwner, runnerRepoName] = appConfig.RUNNER_REPOSITORY.split('/');
		const ref = appConfig.CHECK_WORKFLOW_REF ?? payload.repository.default_branch;
		const inputs = {
			owner: targetRepoOwner,
			repo: targetRepoName,
			ref: targetRef
		};
		context.log.info(
			'Devcontainer-related file change detected in this push.' +
				` Triggering workflow ${appConfig.CHECK_WORKFLOW_NAME} in ${runnerRepoOwner}/${runnerRepoName}@${ref}` +
				` with inputs: ${JSON.stringify(inputs)}`
		);
		const workflowDispatchResult = await createWorkflowDispatch(octokit, {
			owner: runnerRepoOwner,
			repo: runnerRepoName,
			workflow_id: appConfig.CHECK_WORKFLOW_NAME,
			ref,
			inputs,
			return_run_details: true
		});
		const workflowRunUrl = workflowDispatchResult?.html_url;

		// Update commit status to pending with a link to the workflow run
		await octokit.repos.createCommitStatus({
			owner: targetRepoOwner,
			repo: targetRepoName,
			sha: payload.after,
			state: 'pending',
			context: COMMIT_STATUS_CONTEXT,
			description: 'Checking for dev container configuration...',
			target_url: workflowRunUrl
		});
		context.log.info('Workflow dispatch event created successfully.');
	});

	app.on('workflow_run.completed', async (context: Context<'workflow_run.completed'>) => {
		const { octokit, payload } = context;

		// Only listen to workflow run completion events of the runner repository
		const repo = context.repo();
		const runnerRepoInfo = getRunnerRepoInfo(appConfig);
		if (
			repo.owner !== runnerRepoInfo.owner ||
			repo.repo !== runnerRepoInfo.repo ||
			payload.workflow.path.replace(/^\.github\/workflows\//, '') !== appConfig.CHECK_WORKFLOW_NAME
		) {
			context.log.debug(
				`Workflow run completed for ${payload.repository.full_name}, which does not match the configured runner repository. Ignoring event.`
			);
			return;
		}

		// Find artifact that contains the workflow inputs to determine which repository and commit this workflow run is associated with
		const allArtifacts = await octokit.actions.listWorkflowRunArtifacts({
			owner: repo.owner,
			repo: repo.repo,
			run_id: payload.workflow_run.id
		});
		const artifact = allArtifacts.data.artifacts.find((a) => a.name === 'workflow-inputs');
		if (!artifact) {
			context.log.error('No "workflow-inputs" artifact found for completed workflow run.');
			return;
		}

		// Download and extract the artifact to get the workflow inputs
		const { data } = (await octokit.actions.downloadArtifact({
			owner: repo.owner,
			repo: repo.repo,
			artifact_id: artifact.id,
			archive_format: 'zip',
			request: {
				redirect: 'follow'
			}
		})) as unknown as { data: ArrayBuffer };
		const buffer = Buffer.from(data);
		const zip = new AdmZip(buffer);
		const targetFile = zip.getEntries().find((entry) => entry.entryName === 'inputs.json');
		if (!targetFile) {
			context.log.error('No "inputs.json" file found in the "inputs" artifact.');
			return;
		}
		const inputsContent = targetFile.getData().toString('utf-8');
		const inputs = JSON.parse(inputsContent) as {
			// These should match the inputs defined in .github/workflows/devcontainer-check.yaml
			owner: string;
			repo: string;
			ref: string;
		};
		context.log.info(
			`Workflow run completed. Retrieved workflow inputs: ${JSON.stringify(inputs)}`
		);

		// Update the commit status based on the workflow run conclusion
		const targetRepoOwner = inputs.owner;
		const targetRepoName = inputs.repo;
		const sha = inputs.ref;
		const state = payload.workflow_run.conclusion === 'success' ? 'success' : 'failure';
		await octokit.repos.createCommitStatus({
			owner: targetRepoOwner,
			repo: targetRepoName,
			sha,
			state,
			context: COMMIT_STATUS_CONTEXT,
			description:
				state === 'success'
					? 'Dev container configuration is valid.'
					: 'Dev container configuration check failed.',
			target_url: payload.workflow_run.html_url
		});
		context.log.info(
			`Commit status updated based on workflow run conclusion: ${payload.workflow_run.conclusion}`
		);
	});
}) satisfies ApplicationFunction;

/**
 * Parses the runner repository information from the application configuration.
 * @param config Application configuration
 * @returns An object containing the repository info
 */
function getRunnerRepoInfo(config: AppConfig): { owner: string; repo: string } {
	const [owner, repo] = config.RUNNER_REPOSITORY.split('/');
	return { owner, repo };
}
