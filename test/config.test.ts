import { describe, expect, it } from "vitest";
import { AppConfig, DEFAULT_BRANCH_ALIAS } from "../src/config.js";

describe("AppConfig.parse", () => {
  it("loads valid config with reasonable defaults", () => {
    const config = AppConfig.parse({
      RUNNER_REPOSITORY: "acme/devcontainer-check-runner",
    });
    expect(config).toMatchObject({
      RUNNER_REPOSITORY: { owner: "acme", repo: "devcontainer-check-runner" },
      CHECK_WORKFLOW_NAME: "devcontainer-check.yaml",
      CHECK_WORKFLOW_REF: DEFAULT_BRANCH_ALIAS,
      CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: "workflow-inputs",
      CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: "inputs.json",
      PUSH_BRANCHES: [DEFAULT_BRANCH_ALIAS],
      PR_BRANCHES: [DEFAULT_BRANCH_ALIAS],
      ALLOWED_PRINCIPALS: ["*"],
    });
  });

  it("loads valid config with explicit configuration values", () => {
    const config = AppConfig.parse({
      RUNNER_REPOSITORY: "acme/devcontainer-check-runner",
      RUNNER_REPOSITORY_FOR_PRIVATE: "acme/private-runner",
      RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE: "false",
      CHECK_WORKFLOW_NAME: "custom-check.yaml",
      CHECK_WORKFLOW_REF: "release-1",
      CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: "my-workflow-inputs",
      CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: "my-inputs.json",
      PUSH_BRANCHES: "main,develop",
      PR_BRANCHES: "feature/*",
      ALLOWED_PRINCIPALS: " Alice, Bob , org-1 ",
    });
    expect(config).toMatchObject({
      RUNNER_REPOSITORY: { owner: "acme", repo: "devcontainer-check-runner" },
      RUNNER_REPOSITORY_FOR_PRIVATE: { owner: "acme", repo: "private-runner" },
      RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE: false,
      CHECK_WORKFLOW_NAME: "custom-check.yaml",
      CHECK_WORKFLOW_REF: "release-1",
      CHECK_WORKFLOW_INPUTS_ARTIFACT_NAME: "my-workflow-inputs",
      CHECK_WORKFLOW_INPUTS_ARTIFACT_PATH: "my-inputs.json",
      PUSH_BRANCHES: ["main", "develop"],
      PR_BRANCHES: ["feature/*"],
      ALLOWED_PRINCIPALS: ["alice", "bob", "org-1"],
    });
  });

  it("throws when RUNNER_REPOSITORY format is invalid", () => {
    expect(() =>
      AppConfig.parse({
        RUNNER_REPOSITORY: "acme/devcontainer-check/extra",
      }),
    ).toThrow();
  });

  it("rejects empty CHECK_WORKFLOW_NAME", () => {
    expect(() =>
      AppConfig.parse({
        RUNNER_REPOSITORY: "acme/runner",
        CHECK_WORKFLOW_NAME: "",
      }),
    ).toThrow();
  });

  it("rejects empty CHECK_WORKFLOW_REF", () => {
    expect(() =>
      AppConfig.parse({
        RUNNER_REPOSITORY: "acme/runner",
        CHECK_WORKFLOW_REF: "",
      }),
    ).toThrow();
  });

  it("defaults PUSH_BRANCHES, PR_BRANCHES, and ALLOWED_PRINCIPALS to empty array when set to empty string", () => {
    const config = AppConfig.parse({
      RUNNER_REPOSITORY: "acme/runner",
      PUSH_BRANCHES: "",
      PR_BRANCHES: "",
      ALLOWED_PRINCIPALS: "",
    });
    expect(config.PUSH_BRANCHES).toStrictEqual([]);
    expect(config.PR_BRANCHES).toStrictEqual([]);
    expect(config.ALLOWED_PRINCIPALS).toStrictEqual([]);
  });
});
