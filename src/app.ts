import type { ApplicationFunction, Context } from 'probot';
import { type AppConfig, loadConfig } from './config.js';
import { isDevContainerFileChanged } from './devcontainer.js';

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
				` Triggering workflow ${appConfig.CHECK_WORKFLOW_ID} in ${runnerRepoOwner}/${runnerRepoName}@${ref}` +
				` with inputs: ${JSON.stringify(inputs)}`
		);

		await octokit.actions.createWorkflowDispatch({
			owner: runnerRepoOwner,
			repo: runnerRepoName,
			workflow_id: appConfig.CHECK_WORKFLOW_ID,
			ref,
			inputs
		});
		context.log.info('Workflow dispatch event created successfully.');
	});
}) satisfies ApplicationFunction;
