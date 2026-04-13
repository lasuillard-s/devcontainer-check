import type { Probot } from 'probot';
import * as z from 'zod';

export const AppConfig = z.object({
	/** Full name (owner/repo) of the repository where the runner workflow is defined */
	RUNNER_REPOSITORY: z.string().refine(
		(value) => {
			const [owner, repo, ...rest] = value.split('/');
			return owner && repo && rest.length === 0;
		},
		{
			message: 'RUNNER_REPOSITORY must be in the format "owner/repo"'
		}
	),
	/** ID of the workflow to be triggered. Defaults to 'devcontainer-check.yaml' */
	CHECK_WORKFLOW_ID: z.string().nonempty().default('devcontainer-check.yaml'),
	/** Reference for the workflow dispatch event. If not specified, defaults to the default branch */
	CHECK_WORKFLOW_REF: z.string().nullable().default(null)
});
export type AppConfig = z.infer<typeof AppConfig>;

/**
 * Load app configuration from environment variables.
 * @param app Current Probot app instance
 * @returns Validated application configuration
 */
export function loadConfig(app: Probot): AppConfig {
	try {
		return AppConfig.parse(process.env);
	} catch (error) {
		app.log.error(`Failed to load configuration: ${error}`);
		process.exit(1);
	}
}
