import { describe, expect } from "vitest";
import { matchPatterns } from "../../src/utils/string.js";
import { test as it } from "../helpers.js";

describe("matchPatterns", () => {
  it("matches values against glob patterns", () => {
    expect(matchPatterns("main", ["main", "develop"], {})).toBe(true);
    expect(matchPatterns("feature-branch", ["feature-*"], {})).toBe(true);
    expect(matchPatterns("hotfix-123", ["hotfix-*"], {})).toBe(true);
  });

  it("resolves aliases before matching", () => {
    const aliases = { "~DEFAULT_BRANCH": "main" };
    expect(matchPatterns("main", ["~DEFAULT_BRANCH"], aliases)).toBe(true);
    expect(matchPatterns("develop", ["~DEFAULT_BRANCH"], aliases)).toBe(false);
  });

  it("returns false for empty patterns array", () => {
    expect(matchPatterns("main", [], {})).toBe(false);
  });
});
