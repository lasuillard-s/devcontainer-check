import type { ApplicationFunction, Context } from 'probot';
import { type AppConfig, loadConfig } from './config.js';
import pullRequestHandler from './handlers/pull_request.js';
import pushHandler from './handlers/push.js';
import workflowRunCompletedHandler from './handlers/workflow_run.completed.js';

export default ((app) => {
	const appConfig: AppConfig = loadConfig(app);

	app.on('push', async (context: Context<'push'>) => {
		await pushHandler(context, appConfig);
	});
	app.on(
		['pull_request.opened', 'pull_request.synchronize'],
		async (context: Context<'pull_request'>) => {
			await pullRequestHandler(context, appConfig);
		}
	);
	app.on('workflow_run.completed', async (context: Context<'workflow_run.completed'>) => {
		await workflowRunCompletedHandler(context, appConfig);
	});
}) satisfies ApplicationFunction;
