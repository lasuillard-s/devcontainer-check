import type { Probot } from 'probot';
import * as z from 'zod';
import { Repo } from './octokit.js';
import { errorToString } from './utils.js';

export const DEFAULT_BRANCH_ALIAS = '~DEFAULT_BRANCH';

export const AppConfig = z.object({
	/** Full name (owner/repo) of the runner repository used for public target repositories. */
	RUNNER_REPOSITORY: z
		.string()
		.refine(validateRepositoryFormat, {
			message: 'RUNNER_REPOSITORY must be in the format "owner/repo"'
		})
		.transform(Repo.fromFullName),
	/** Full name (owner/repo) of the runner repository used for private target repositories. If unset, checks for private repositories are skipped. */
	RUNNER_REPOSITORY_FOR_PRIVATE: z
		.string()
		.refine(validateRepositoryFormat, {
			message: 'RUNNER_REPOSITORY_FOR_PRIVATE must be in the format "owner/repo"'
		})
		.transform(Repo.fromFullName)
		.optional(),
	/** Set to true to allow dispatching private target repositories to the public runner when no private runner repository is configured. Off by default. */
	USE_PUBLIC_RUNNER_FOR_PRIVATE_REPOSITORIES: z.string().optional().transform(toBoolean),
	/** ID of the workflow to be triggered. Defaults to 'devcontainer-check.yaml'. */
	CHECK_WORKFLOW_NAME: z.string().nonempty().default('devcontainer-check.yaml'),
	/** Reference for the workflow dispatch event. Defaults to the default branch of the runner repository. */
	CHECK_WORKFLOW_REF: z.string().nonempty().default(DEFAULT_BRANCH_ALIAS),
	/** Name of the artifact containing the workflow inputs. Defaults to 'workflow-inputs'. */
	CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: z.string().nonempty().default('workflow-inputs'),
	/** Path to the inputs file within the artifact. Defaults to 'inputs.json'. */
	CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: z.string().nonempty().default('inputs.json'),
	/** Comma-separated list of branch names (supports glob patterns) that check runs on. Defaults to the repository default branch. */
	PUSH_BRANCHES: z
		.string()
		.transform(parseCsv)
		.default(() => [DEFAULT_BRANCH_ALIAS]),
	/** Comma-separated list of target branch names (supports glob patterns) that check runs on for pull requests. Defaults to the repository default branch. */
	PR_BRANCHES: z
		.string()
		.transform(parseCsv)
		.default(() => [DEFAULT_BRANCH_ALIAS])
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
 * Validate that a string is in the format "owner/repo".
 * @param value String to validate
 * @returns True if the string is in the correct format, false otherwise
 */
function validateRepositoryFormat(value: string): boolean {
	const [owner, repo, ...rest] = value.split('/');
	return Boolean(owner && repo && rest.length === 0);
}

/**
 * Convert a string to a boolean.
 * @param value String to convert
 * @returns True if the string is a truthy value, false otherwise
 */
function toBoolean(value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined;
	return value.trim().toLowerCase() === 'true';
}

/**
 * Parse a comma-separated string into an array of trimmed strings.
 * @param value Comma-separated string
 * @returns Array of string
 */
function parseCsv(value: string): string[] {
	const normalizedValue = value.trim();
	return normalizedValue
		? normalizedValue
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}
