import { describe, expect } from "vitest";
import { errorToString } from "../../src/utils/error.js";
import { test as it } from "../helpers.js";

describe("errorToString", () => {
  it("returns the message for Error instances", () => {
    expect(errorToString(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(errorToString("plain failure")).toBe("plain failure");
    expect(errorToString(null)).toBe("null");
    expect(errorToString(undefined)).toBe("undefined");
    expect(errorToString(42)).toBe("42");
    expect(errorToString({ message: "nested" })).toBe("[object Object]");
  });
});
