import nock from "nock";
import { beforeEach, describe, expect, vi } from "vitest";
import openedPayload from "../fixtures/pull_request.opened.json" with { type: "json" };
import synchronizePayload from "../fixtures/pull_request.synchronize.json" with { type: "json" };
import { test as it } from "../helpers.js";

const runnerRepo = "acme/devcontainer-check-runner";

beforeEach(() => {
  vi.stubEnv("RUNNER_REPOSITORY", "acme/devcontainer-check-runner");
  vi.stubEnv("CHECK_WORKFLOW_NAME", "devcontainer-check.yaml");
  vi.stubEnv("CHECK_WORKFLOW_REF", undefined);
  vi.stubEnv("PR_BRANCHES", "main");
});

describe("when principal is unauthorized on pull_request", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOWED_PRINCIPALS", "authorized-org-only");
  });

  it("skips processing without making any API calls", async ({ probot }) => {
    const mock = nock("https://api.github.com");

    // @ts-expect-error Ignore fixture modification
    await probot.receive({
      id: "",
      name: "pull_request",
      payload: openedPayload,
    });

    expect(mock.isDone()).toBe(true);
    expect(mock.pendingMocks()).toStrictEqual([]);
  });
});

describe("pull_request.opened event", () => {
  const installationId = openedPayload.installation.id;
  const owner = openedPayload.repository.owner.login;
  const repo = openedPayload.repository.name;
  const repoFullName = openedPayload.repository.full_name;
  const sha = openedPayload.pull_request.head.sha;
  const number = openedPayload.pull_request.number;

  it("dispatches a workflow when PR base branch matches PR_BRANCHES and devcontainer files are changed", async ({
    probot,
  }) => {
    // Arrange
    const workflowRunUrl =
      "https://github.com/acme/devcontainer-check-runner/actions/runs/123";
    const mock = nock("https://api.github.com")
      .post(`/app/installations/${installationId}/access_tokens`)
      .reply(200, { token: "test", permissions: { actions: "write" } })
      .get(`/repos/${repoFullName}`)
      .reply(200, { default_branch: "main", visibility: "public" })
      .get(`/repos/${repoFullName}/pulls/${number}/files`)
      .reply(200, [
        { filename: ".devcontainer.example/devcontainer.json" },
        { filename: ".devcontainer.example/onCreateCommand.sh" },
        { filename: ".env.example" },
      ])
      .get(`/repos/${runnerRepo}`)
      .reply(200, { default_branch: "main" })
      .post(
        `/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`,
        (body: unknown) => {
          expect(body).toStrictEqual({
            ref: "main",
            inputs: {
              owner: owner,
              repo: repo,
              sha: sha,
            },
            return_run_details: true,
          });
          return true;
        },
      )
      .reply(201, { html_url: workflowRunUrl })
      .post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
        expect(body).toStrictEqual({
          head_sha: sha,
          name: "Devcontainer Check",
          status: "in_progress",
          details_url: workflowRunUrl,
          output: {
            title: "Checking for dev container configuration...",
            summary: "Check is in progress. This might take a few minutes.",
          },
        });
        return true;
      })
      .reply(201);

    // Act
    // @ts-expect-error Ignore fixture modification
    await probot.receive({
      id: "",
      name: "pull_request",
      payload: openedPayload,
    });

    // Assert
    expect(mock.isDone()).toBe(true);
    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  it("does not dispatch a workflow when no devcontainer files are changed", async ({
    probot,
  }) => {
    // Arrange
    const mock = nock("https://api.github.com")
      .post(`/app/installations/${installationId}/access_tokens`)
      .reply(200, { token: "test", permissions: { actions: "write" } })
      .get(`/repos/${repoFullName}`)
      .reply(200, { default_branch: "main", visibility: "public" })
      .get(`/repos/${repoFullName}/pulls/${number}/files`)
      .reply(200, [{ filename: "package.json" }])
      .post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
        expect(body).toStrictEqual({
          head_sha: sha,
          name: "Devcontainer Check",
          status: "completed",
          conclusion: "success",
          output: {
            title: "Dev container configuration did not change.",
            summary: `There were 1 changed files, but none of them were related to devcontainer configuration.`,
          },
        });
        return true;
      })
      .reply(201);

    // Act
    // @ts-expect-error Ignore fixture modification
    await probot.receive({
      id: "",
      name: "pull_request",
      payload: openedPayload,
    });

    // Assert
    expect(mock.isDone()).toBe(true);
    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  it("skips when PR base branch does not match PR_BRANCHES", async ({
    probot,
  }) => {
    // Arrange
    const payloadWithDifferentBase = structuredClone(openedPayload) as Record<
      string,
      unknown
    >;
    (payloadWithDifferentBase.pull_request as Record<string, unknown>).base = {
      ref: "release",
    };

    const mock = nock("https://api.github.com");
    // Fails early, no API calls

    // Act
    // @ts-expect-error Ignore fixture modification
    await probot.receive({
      id: "",
      name: "pull_request",
      payload: payloadWithDifferentBase,
    });

    // Assert
    expect(mock.isDone()).toBe(true);
    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  describe("private repository runner selection", () => {
    it("skips when no private runner is configured and the guardrail is enabled", async ({
      probot,
    }) => {
      // Arrange
      const mock = nock("https://api.github.com")
        .post(`/app/installations/${installationId}/access_tokens`)
        .reply(200, { token: "test", permissions: { actions: "write" } })
        .get(`/repos/${repoFullName}`)
        .reply(200, { default_branch: "main", visibility: "private" });
      // Should abort here

      // Act
      // @ts-expect-error Ignore fixture modification
      await probot.receive({
        id: "",
        name: "pull_request",
        payload: openedPayload,
      });

      // Assert
      expect(mock.isDone()).toBe(true);
      expect(mock.pendingMocks()).toStrictEqual([]);
    });

    describe("when RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE is true", () => {
      beforeEach(() => {
        vi.stubEnv("RUNNER_REPOSITORY_USE_PUBLIC_FOR_PRIVATE", "true");
      });

      it("dispatches to the public runner for private repositories", async ({
        probot,
      }) => {
        // Arrange
        const workflowRunUrl =
          "https://github.com/acme/devcontainer-check-runner/actions/runs/123";
        const mock = nock("https://api.github.com")
          .post(`/app/installations/${installationId}/access_tokens`)
          .reply(200, { token: "test", permissions: { actions: "write" } })
          .get(`/repos/${repoFullName}`)
          .reply(200, { default_branch: "main", visibility: "private" })
          .get(`/repos/${repoFullName}/pulls/${number}/files`)
          .reply(200, [
            { filename: ".devcontainer.example/devcontainer.json" },
            { filename: ".devcontainer.example/onCreateCommand.sh" },
            { filename: ".env.example" },
          ])
          .get(`/repos/${runnerRepo}`)
          .reply(200, { default_branch: "main" })
          .post(
            `/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`,
            (body: unknown) => {
              expect(body).toStrictEqual({
                ref: "main",
                inputs: {
                  owner: owner,
                  repo: repo,
                  sha: sha,
                },
                return_run_details: true,
              });
              return true;
            },
          )
          .reply(201, { html_url: workflowRunUrl })
          .post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
            expect(body).toStrictEqual({
              head_sha: sha,
              name: "Devcontainer Check",
              status: "in_progress",
              details_url: workflowRunUrl,
              output: {
                title: "Checking for dev container configuration...",
                summary: "Check is in progress. This might take a few minutes.",
              },
            });
            return true;
          })
          .reply(201);

        // Act
        // @ts-expect-error Ignore fixture modification
        await probot.receive({
          id: "",
          name: "pull_request",
          payload: openedPayload,
        });

        // Assert
        expect(mock.isDone()).toBe(true);
        expect(mock.pendingMocks()).toStrictEqual([]);
      });
    });
  });

  describe("internal repository visibility in pull requests", () => {
    it("skips workflow for internal repository when no private runner is configured", async ({
      probot,
    }) => {
      // Arrange
      const mock = nock("https://api.github.com")
        .post(`/app/installations/${installationId}/access_tokens`)
        .reply(200, { token: "test", permissions: { actions: "write" } })
        .get(`/repos/${repoFullName}`)
        .reply(200, { default_branch: "main", visibility: "internal" });

      // Act
      // @ts-expect-error Ignore fixture modification
      await probot.receive({
        id: "",
        name: "pull_request",
        payload: openedPayload,
      });

      // Assert
      expect(mock.isDone()).toBe(true);
      expect(mock.pendingMocks()).toStrictEqual([]);
    });
  });
});

describe("pull_request.synchronize event", () => {
  const installationId = synchronizePayload.installation.id;
  const owner = synchronizePayload.repository.owner.login;
  const repo = synchronizePayload.repository.name;
  const repoFullName = synchronizePayload.repository.full_name;
  const sha = synchronizePayload.pull_request.head.sha;
  const number = synchronizePayload.pull_request.number;

  it("dispatches workflow on synchronize when devcontainer files changed", async ({
    probot,
  }) => {
    // Arrange
    const workflowRunUrl =
      "https://github.com/acme/devcontainer-check-runner/actions/runs/123";
    const mock = nock("https://api.github.com")
      .post(`/app/installations/${installationId}/access_tokens`)
      .reply(200, { token: "test", permissions: { actions: "write" } })
      .get(`/repos/${repoFullName}`)
      .reply(200, { default_branch: "main", visibility: "public" })
      .get(`/repos/${repoFullName}/pulls/${number}/files`)
      .reply(200, [{ filename: ".devcontainer/devcontainer.json" }])
      .get(`/repos/${runnerRepo}`)
      .reply(200, { default_branch: "main" })
      .post(
        `/repos/${runnerRepo}/actions/workflows/devcontainer-check.yaml/dispatches`,
        (body: unknown) => {
          expect(body).toStrictEqual({
            ref: "main",
            inputs: {
              owner: owner,
              repo: repo,
              sha: sha,
            },
            return_run_details: true,
          });
          return true;
        },
      )
      .reply(201, { html_url: workflowRunUrl })
      .post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
        expect(body).toStrictEqual({
          head_sha: sha,
          name: "Devcontainer Check",
          status: "in_progress",
          details_url: workflowRunUrl,
          output: {
            title: "Checking for dev container configuration...",
            summary: "Check is in progress. This might take a few minutes.",
          },
        });
        return true;
      })
      .reply(201);

    // Act
    // @ts-expect-error Ignore fixture modification
    await probot.receive({
      id: "",
      name: "pull_request",
      payload: synchronizePayload,
    });

    // Assert
    expect(mock.isDone()).toBe(true);
    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  it("does not dispatch workflow on synchronize when no devcontainer files changed", async ({
    probot,
  }) => {
    // Arrange
    const mock = nock("https://api.github.com")
      .post(`/app/installations/${installationId}/access_tokens`)
      .reply(200, { token: "test", permissions: { actions: "write" } })
      .get(`/repos/${repoFullName}`)
      .reply(200, { default_branch: "main", visibility: "public" })
      .get(`/repos/${repoFullName}/pulls/${number}/files`)
      .reply(200, [])
      .post(`/repos/${repoFullName}/check-runs`, (body: unknown) => {
        expect(body).toStrictEqual({
          head_sha: sha,
          name: "Devcontainer Check",
          status: "completed",
          conclusion: "success",
          output: {
            title: "Dev container configuration did not change.",
            summary: `There were 0 changed files, but none of them were related to devcontainer configuration.`,
          },
        });
        return true;
      })
      .reply(201);

    // Act
    // @ts-expect-error Ignore fixture modification
    await probot.receive({
      id: "",
      name: "pull_request",
      payload: synchronizePayload,
    });

    // Assert
    expect(mock.isDone()).toBe(true);
    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  describe("repository visibility in pull requests", () => {
    it("treats undefined visibility as private/internal and skips when no private runner is configured", async ({
      probot,
    }) => {
      // Arrange
      const mock = nock("https://api.github.com")
        .post(`/app/installations/${installationId}/access_tokens`)
        .reply(200, { token: "test", permissions: { actions: "write" } })
        .get(`/repos/${repoFullName}`)
        .reply(200, { default_branch: "main" });

      // Act
      // @ts-expect-error Ignore fixture modification
      await probot.receive({
        id: "",
        name: "pull_request",
        payload: synchronizePayload,
      });

      // Assert
      expect(mock.isDone()).toBe(true);
      expect(mock.pendingMocks()).toStrictEqual([]);
    });
  });
});
