import type { Probot } from 'probot';
import * as z from 'zod';
import { Repo } from './types.js';
import { errorToString } from './utils.js';

export const DEFAULT_BRANCH_ALIAS = '~DEFAULT_BRANCH';

export const AppConfig = z
	.object({
		/** Full name (owner/repo) of the repository where the runner workflow is defined. */
		RUNNER_REPOSITORY: z
			.string()
			.refine(validateRepositoryFormat, {
				message: 'RUNNER_REPOSITORY must be in the format "owner/repo"'
			})
			.transform(toRepoObject),
		/** Full name (owner/repo) of the repository where the runner workflow is defined for public repositories. Falls back to RUNNER_REPOSITORY. */
		RUNNER_REPOSITORY_FOR_PUBLIC: z
			.string()
			.refine(validateRepositoryFormat, {
				message: 'RUNNER_REPOSITORY_FOR_PUBLIC must be in the format "owner/repo"'
			})
			.transform(toRepoObject)
			.optional(),
		/** Full name (owner/repo) of the repository where the runner workflow is defined for private repositories. Falls back to RUNNER_REPOSITORY. */
		RUNNER_REPOSITORY_FOR_PRIVATE: z
			.string()
			.refine(validateRepositoryFormat, {
				message: 'RUNNER_REPOSITORY_FOR_PRIVATE must be in the format "owner/repo"'
			})
			.transform(toRepoObject)
			.optional(),
		/** Set to true to allow dispatching to public runners for private repositories. */
		RUNNER_REPOSITORY_DISABLE_GUARDRAIL: z.string().optional().transform(toBoolean),
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
	})
	.transform((config) => {
		return {
			...config,
			resolveRunnerRepository(targetVisibility: string | boolean | undefined) {
				if (!targetVisibility || targetVisibility === 'public') {
					const runnerPublic = config.RUNNER_REPOSITORY_FOR_PUBLIC;
					if (runnerPublic) return runnerPublic;
				}
				if (targetVisibility && targetVisibility !== 'public') {
					const runnerPrivate = config.RUNNER_REPOSITORY_FOR_PRIVATE;
					if (runnerPrivate) return runnerPrivate;
				}
				return config.RUNNER_REPOSITORY;
			}
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
 * Validate that a string is in the format "owner/repo".
 * @param value String to validate
 * @returns True if the string is in the correct format, false otherwise
 */
function validateRepositoryFormat(value: string): boolean {
	const [owner, repo, ...rest] = value.split('/');
	return Boolean(owner && repo && rest.length === 0);
}

/**
 * Convert a repository string in the format "owner/repo" to an object with owner and repo properties.
 * @param repoString Repository string to convert
 * @returns An object containing the owner and repo
 */
function toRepoObject(repoString: string): Repo {
	const [owner, repo] = repoString.split('/');
	return { owner, repo };
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
