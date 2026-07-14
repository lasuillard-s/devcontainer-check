import type { ApplicationFunction, Context } from 'probot';
import { type AppConfig, loadConfig } from './config.js';
import PullRequestHandler from './handlers/pull_request.js';
import PushHandler from './handlers/push.js';
import WorkflowRunCompletedHandler from './handlers/workflow_run.completed.js';

export default ((app) => {
	const appConfig: AppConfig = loadConfig(app);

	app.on('push', (context: Context<'push'>) => {
		return new PushHandler(context, appConfig).handle();
	});
	app.on(
		['pull_request.opened', 'pull_request.synchronize'],
		(context: Context<'pull_request'>) => {
			return new PullRequestHandler(context, appConfig).handle();
		}
	);
	app.on('workflow_run.completed', (context: Context<'workflow_run.completed'>) => {
		return new WorkflowRunCompletedHandler(context, appConfig).handle();
	});
}) satisfies ApplicationFunction;
