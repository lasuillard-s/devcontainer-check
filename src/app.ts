import type { ApplicationFunction, Context } from 'probot';
import { AppConfig } from './config.js';
import PullRequestHandler from './event-handlers/pull_request.js';
import PushHandler from './event-handlers/push.js';
import WorkflowRunCompletedHandler from './event-handlers/workflow_run.completed.js';

export default ((app) => {
	const appConfig: AppConfig = AppConfig.parse(process.env);

	app.onError((error) => {
		app.log.error(error, 'Unhandled error occurred');
	});

	// Register event listeners
	// NOTE: Handlers are awaited here because they are expected to handle events and wait for completion
	//       before returning. It could be changed in future due to GitHub's ACK timeout (10s)
	app.on('push', async (context: Context<'push'>) => {
		await new PushHandler(context, appConfig).handle();
	});
	app.on(
		['pull_request.opened', 'pull_request.synchronize'],
		async (context: Context<'pull_request'>) => {
			await new PullRequestHandler(context, appConfig).handle();
		}
	);
	app.on('workflow_run.completed', async (context: Context<'workflow_run.completed'>) => {
		await new WorkflowRunCompletedHandler(context, appConfig).handle();
	});
}) satisfies ApplicationFunction;
