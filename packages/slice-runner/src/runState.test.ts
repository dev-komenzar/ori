import { describe, expect, it } from "vitest";
import {
  ensureKind,
  ensurePhase,
  fixAttempts,
  markEnded,
  markStarted,
  newRunState,
  recordFixAttempt,
} from "./runState.js";
import { nextPhase, PHASES } from "./phases.js";

const NOW = "2026-05-28T00:00:00.000Z";
const LATER = "2026-05-28T00:05:00.000Z";

describe("nextPhase", () => {
  it("returns the next phase in declared order", () => {
    expect(nextPhase("derive")).toBe("plan");
    expect(nextPhase("review")).toBe("finalize");
  });

  it("returns null for the terminal phase", () => {
    expect(nextPhase("finalize")).toBeNull();
  });
});

describe("ensureKind / ensurePhase", () => {
  it("accepts valid values", () => {
    expect(ensureKind("slice")).toBe("slice");
    expect(ensureKind("page")).toBe("page");
    expect(ensurePhase("review")).toBe("review");
  });

  it("rejects invalid values with a helpful error", () => {
    expect(() => ensureKind("widget")).toThrow(/Unknown kind/);
    expect(() => ensurePhase("sync")).toThrow(/Unknown phase/);
  });
});

describe("run state transitions", () => {
  it("starts pending, marks in_progress, completes done in order", () => {
    const state = newRunState("slice", "demo", NOW);
    expect(state.current_phase).toBeNull();
    expect(state.completion).toEqual([]);

    markStarted(state, "derive", NOW);
    expect(state.current_phase).toBe("derive");
    expect(state.phases.derive?.state).toBe("in_progress");
    expect(state.phases.derive?.started_at).toBe(NOW);

    markEnded(state, "derive", "done", LATER, "spec.md written");
    expect(state.phases.derive?.state).toBe("done");
    expect(state.phases.derive?.completed_at).toBe(LATER);
    expect(state.phases.derive?.notes).toBe("spec.md written");
    expect(state.completion).toEqual(["derive"]);
  });

  it("does not duplicate completion entries", () => {
    const state = newRunState("slice", "demo", NOW);
    markStarted(state, "derive", NOW);
    markEnded(state, "derive", "done", LATER);
    markEnded(state, "derive", "done", LATER);
    expect(state.completion).toEqual(["derive"]);
  });

  it("marks failed without advancing completion", () => {
    const state = newRunState("slice", "demo", NOW);
    markStarted(state, "test-red", NOW);
    markEnded(state, "test-red", "failed", LATER, "compile error");
    expect(state.completion).toEqual([]);
    expect(state.phases["test-red"]?.state).toBe("failed");
  });
});

describe("self-fix counter", () => {
  it("starts at 0 and increments per record", () => {
    const state = newRunState("slice", "demo", NOW);
    expect(fixAttempts(state, "impl-green")).toBe(0);
    expect(recordFixAttempt(state, "impl-green")).toBe(1);
    expect(fixAttempts(state, "impl-green")).toBe(1);
    expect(recordFixAttempt(state, "impl-green")).toBe(2);
  });

  it("tracks counters per phase independently", () => {
    const state = newRunState("slice", "demo", NOW);
    recordFixAttempt(state, "derive");
    recordFixAttempt(state, "review");
    recordFixAttempt(state, "review");
    expect(fixAttempts(state, "derive")).toBe(1);
    expect(fixAttempts(state, "review")).toBe(2);
    expect(fixAttempts(state, "plan")).toBe(0);
  });
});

describe("PHASES contract", () => {
  it("exposes the seven phases in canonical order", () => {
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
