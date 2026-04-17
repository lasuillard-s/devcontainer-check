import type { Probot } from 'probot';
import * as z from 'zod';
import { errorToString } from './utils.js';

export const DEFAULT_BRANCH_ALIAS = '~DEFAULT_BRANCH';

export const AppConfig = z
	.object({
		/** Full name (owner/repo) of the repository where the runner workflow is defined. */
		RUNNER_REPOSITORY: z.string().refine(
			(value) => {
				const [owner, repo, ...rest] = value.split('/');
				return owner && repo && rest.length === 0;
			},
			{
				message: 'RUNNER_REPOSITORY must be in the format "owner/repo"'
			}
		),
		/** ID of the workflow to be triggered. Defaults to 'devcontainer-check.yaml'. */
		CHECK_WORKFLOW_NAME: z.string().nonempty().default('devcontainer-check.yaml'),
		/** Reference for the workflow dispatch event. If not specified, defaults to the default branch. */
		CHECK_WORKFLOW_REF: z.string().optional().default(DEFAULT_BRANCH_ALIAS),
		/** Name of the artifact containing the workflow inputs. */
		CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: z.string().nonempty().default('workflow-inputs'),
		/**
		 * Path to the inputs file within the artifact.
		 *
		 * If the file is located at the subdirectory `path/inputs.json` in the artifact, this should be set to `path/inputs.json`.
		 * Otherwise, if the file is located at the root of the artifact, this should be set to `inputs.json`.
		 */
		CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: z.string().nonempty().default('inputs.json'),
		/** Comma-separated list of branches that check runs on. Supports glob patterns. Defaults to the repository default branch. */
		PUSH_BRANCHES: z
			.string()
			.transform(parseCsv)
			.default(() => [DEFAULT_BRANCH_ALIAS]),
		/**
		 * Comma-separated list of target branches that check runs on for pull requests.
		 *
		 * Supports glob patterns (features/*).
		 * Defaults to the repository default branch.
		 */
		PR_BRANCHES: z
			.string()
			.optional() // Default is handled in the second transform to allow it to default to PUSH_BRANCHES
			.transform((value) => (value ? parseCsv(value) : undefined))
	})
	.transform((config) => {
		return {
			...config,
			PR_BRANCHES: config.PR_BRANCHES ?? config.PUSH_BRANCHES
		};
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
		app.log.error(`Failed to load configuration: ${errorToString(error)}`);
		process.exit(1);
	}
}

/**
 * Parse a comma-separated string into an array of trimmed strings.
 * @param value Comma-separated string
 * @returns Array of string
 */
function parseCsv(value: string): string[] {
	return value.split(',').map((item) => item.trim());
}
