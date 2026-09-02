import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./password.ts?raw";

import { MIN_PASSWORD_LENGTH, passwordProblem } from "./password";

describe("passwordProblem", () => {
  it("accepts a long enough pair that matches", () => {
    expect(passwordProblem("correcthorse", "correcthorse")).toBeNull();
  });

  it("rejects one shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(passwordProblem(short, short)).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("accepts one exactly at the minimum, so the boundary is not off by one", () => {
    const exact = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(passwordProblem(exact, exact)).toBeNull();
  });

  it("rejects a mismatch", () => {
    expect(passwordProblem("correcthorse", "correcthorsf")).toContain("match");
  });

  // Length first: someone who typed a short password twice is told the thing they can act
  // on, not that their two identical entries disagree.
  it("reports length before mismatch when both are wrong", () => {
    expect(passwordProblem("abc", "xyz")).toContain(String(MIN_PASSWORD_LENGTH));
  });
});

// Pure, like the other lib modules: the sign-up form and the set-password form both use
// it, and neither may drag a store into it.
it("imports nothing outside this directory", () => {
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
});
