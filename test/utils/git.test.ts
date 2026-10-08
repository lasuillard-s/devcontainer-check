import { describe, expect } from "vitest";
import { branchNameFromRef, isRefTag } from "../../src/utils/git.js";
import { test as it } from "../helpers.js";

describe("isRefTag", () => {
  it("should return true for tag refs", () => {
    expect(isRefTag("refs/tags/v1.0.0")).toBe(true);
    expect(isRefTag("refs/tags/feature-branch")).toBe(true);
  });

  it("should return false for non-tag refs", () => {
    expect(isRefTag("refs/heads/main")).toBe(false);
    expect(isRefTag("refs/heads/feature-branch")).toBe(false);
    expect(isRefTag("refs/pull/123")).toBe(false);
  });
});

describe("branchNameFromRef", () => {
  it("should extract branch name from refs/heads/", () => {
    expect(branchNameFromRef("refs/heads/main")).toBe("main");
    expect(branchNameFromRef("refs/heads/feature-branch")).toBe(
      "feature-branch",
    );
  });

  it("should return null if the ref does not start with refs/heads/", () => {
    expect(branchNameFromRef("refs/tags/v1.0.0")).toBeNull();
    expect(branchNameFromRef("refs/pull/123")).toBeNull();
  });

  it("should return null for empty string ref", () => {
    expect(branchNameFromRef("")).toBeNull();
  });

  it("should return null for refs/heads/ with empty branch name", () => {
    expect(branchNameFromRef("refs/heads/")).toBeNull();
  });
});
