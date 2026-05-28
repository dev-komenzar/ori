import { describe, expect, it } from "vitest";
import { isValidPhase, nextPhase, PHASES } from "./phases.js";

describe("PHASES contract", () => {
  it("exposes the seven phases in canonical order, aligned with .apm/skills/ori-<phase>/", () => {
    expect([...PHASES]).toEqual([
      "derive",
      "plan",
      "test-red",
      "impl-green",
      "refactor",
      "review",
      "finalize",
    ]);
  });
});

describe("nextPhase", () => {
  it("returns the next phase in declared order", () => {
    expect(nextPhase("derive")).toBe("plan");
    expect(nextPhase("plan")).toBe("test-red");
    expect(nextPhase("review")).toBe("finalize");
  });

  it("returns null for the terminal phase", () => {
    expect(nextPhase("finalize")).toBeNull();
  });
});

describe("isValidPhase", () => {
  it("accepts canonical phase names", () => {
    expect(isValidPhase("derive")).toBe(true);
    expect(isValidPhase("finalize")).toBe(true);
  });

  it("rejects unknown names (including the old 'sync' alias)", () => {
    expect(isValidPhase("sync")).toBe(false);
    expect(isValidPhase("verify")).toBe(false);
    expect(isValidPhase("")).toBe(false);
  });
});
