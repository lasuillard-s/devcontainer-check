import type { ApplicationFunction, Context } from 'probot';
import { type AppConfig, loadConfig } from './config.js';
import InstallationHandler from './handlers/installation.js';
import PullRequestHandler from './handlers/pull_request.js';
import PushHandler from './handlers/push.js';
import WorkflowRunCompletedHandler from './handlers/workflow_run.completed.js';

export default ((app) => {
	const appConfig: AppConfig = loadConfig(app);

	app.onError((error) => {
		app.log.error(error, 'Unhandled error occurred');
	});

	// Register event listeners
	// NOTE: Handlers are awaited here because they are expected to handle events and wait for completion
	//       before returning. It could be changed in future due to GitHub's ACK timeout (10s)
	app.on(
		['installation.created', 'installation.unsuspend'],
		async (context: Context<'installation.created' | 'installation.unsuspend'>) => {
			await new InstallationHandler(context, appConfig, app).handle();
		}
	);
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
