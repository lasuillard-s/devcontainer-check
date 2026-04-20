/**
 * Type definition for the expected structure of the workflow inputs artifact.
 *
 * These should match the inputs defined in `.github/workflows/devcontainer-check.yaml`
 */
export interface WorkflowInputs {
	owner: string;
	repo: string;
	sha: string;
}
