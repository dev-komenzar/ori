import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS, DEFAULT_PHASE_CONFIG, resolveModel, type OriModelConfig } from "./models.js";

const baseConfig: OriModelConfig = {
  phases: DEFAULT_PHASE_CONFIG,
  agents: DEFAULT_AGENTS,
  current_agent: "claude",
};

describe("resolveModel", () => {
  it("review phase uses reasoning model (Opus for claude)", () => {
    expect(resolveModel("review", baseConfig)).toBe("claude-opus-4-7");
  });

  it("derive phase uses deep model (Sonnet for claude)", () => {
    expect(resolveModel("derive", baseConfig)).toBe("claude-sonnet-4-6");
  });

  it("refactor phase uses fast model (Haiku for claude)", () => {
    expect(resolveModel("refactor", baseConfig)).toBe("claude-haiku-4-5");
  });

  it("opencode defaults to DeepSeek family", () => {
    expect(resolveModel("derive", baseConfig, "opencode")).toBe(
      "deepseek/deepseek-v4-pro",
    );
    expect(resolveModel("review", baseConfig, "opencode")).toBe(
      "deepseek/deepseek-v4-pro",
    );
    expect(resolveModel("refactor", baseConfig, "opencode")).toBe(
      "deepseek/deepseek-v4-flash",
    );
  });

  it("model_override bypasses capability mapping", () => {
    const cfg: OriModelConfig = {
      ...baseConfig,
      phases: {
        ...DEFAULT_PHASE_CONFIG,
        review: { capability: "reasoning", model_override: "claude-opus-4-7" },
      },
    };
    expect(resolveModel("review", cfg)).toBe("claude-opus-4-7");
  });
});
