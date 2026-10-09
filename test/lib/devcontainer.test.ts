import { describe, expect } from "vitest";
import { isDevContainerFileChanged } from "../../src/lib/devcontainer.js";
import { test as it } from "../helpers.js";

describe("isDevContainerFileChanged", () => {
  it("returns true when .devcontainer file is changed", () => {
    expect(
      isDevContainerFileChanged([
        "src/app.ts",
        ".devcontainer/devcontainer.json",
      ]),
    ).toBe(true);
    expect(
      isDevContainerFileChanged([
        ".github/workflows/ci.yaml",
        ".devcontainer/onCreateCommand.sh",
      ]),
    ).toBe(true);
  });

  it("returns true when .devcontainer.example file is changed", () => {
    expect(
      isDevContainerFileChanged([
        "docs/readme.md",
        ".devcontainer.example/devcontainer.json",
      ]),
    ).toBe(true);
    expect(
      isDevContainerFileChanged([
        ".github/workflows/ci.yaml",
        ".devcontainer.example/onCreateCommand.sh",
      ]),
    ).toBe(true);
  });

  it("returns true when root devcontainer configuration file is changed", () => {
    expect(isDevContainerFileChanged([".devcontainer.json"])).toBe(true);
    expect(isDevContainerFileChanged([".devcontainer.example.json"])).toBe(
      true,
    );
  });

  it("returns true when lockfile is changed", () => {
    expect(isDevContainerFileChanged(["devcontainer-lock.json"])).toBe(true);
    expect(isDevContainerFileChanged([".devcontainer-lock.json"])).toBe(true);
    expect(isDevContainerFileChanged(["devcontainer-lock.example.json"])).toBe(
      true,
    );
    expect(isDevContainerFileChanged([".devcontainer-lock.example.json"])).toBe(
      true,
    );
    expect(
      isDevContainerFileChanged([".devcontainer/devcontainer-lock.json"]),
    ).toBe(true);
  });

  it("returns true when an explicitly referenced file is changed", () => {
    expect(
      isDevContainerFileChanged(
        ["docker-compose.yaml"],
        ["docker-compose.yaml"],
      ),
    ).toBe(true);
    expect(
      isDevContainerFileChanged(["scripts/setup.sh"], ["scripts/setup.sh"]),
    ).toBe(true);
    expect(
      isDevContainerFileChanged(["Dockerfile"], ["Dockerfile", "compose.yaml"]),
    ).toBe(true);
  });

  it("does not trigger on unreferenced docker-compose or Dockerfile", () => {
    expect(isDevContainerFileChanged(["docker-compose.yaml"])).toBe(false);
    expect(isDevContainerFileChanged(["docker-compose.yml"])).toBe(false);
    expect(isDevContainerFileChanged(["Dockerfile"])).toBe(false);
    expect(isDevContainerFileChanged(["Dockerfile.dev"])).toBe(false);
  });

  it("returns false when no devcontainer-related files are changed", () => {
    expect(isDevContainerFileChanged(["src/app.ts", "README.md"])).toBe(false);
    expect(isDevContainerFileChanged(["package.json", "tsconfig.json"])).toBe(
      false,
    );
  });

  it("returns false for files exactly named .devcontainer or .devcontainer.example", () => {
    expect(isDevContainerFileChanged([".devcontainer"])).toBe(false);
    expect(isDevContainerFileChanged([".devcontainer.example"])).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isDevContainerFileChanged([])).toBe(false);
  });

  it("returns true for files in subdirectories", () => {
    expect(
      isDevContainerFileChanged([
        ".devcontainer/extensions/ms-azuretools.json",
      ]),
    ).toBe(true);
    expect(
      isDevContainerFileChanged([
        ".devcontainer.example/tasks/postCreateCommand.sh",
      ]),
    ).toBe(true);
  });
});
