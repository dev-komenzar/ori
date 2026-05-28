import type { Phase } from "./phases.js";

export type CapabilityRole = "fast" | "deep" | "reasoning";

export interface AgentSpec {
  capability_to_model: Record<CapabilityRole, string>;
  spawn?: {
    binary?: string;
    args?: string[];
    mode?: "headless" | "manual";
    instructions?: string;
  };
}

export interface PhaseConfig {
  capability: CapabilityRole;
  fresh_context?: boolean;
  model_override?: string;
}

export interface OriModelConfig {
  phases: Record<Phase, PhaseConfig>;
  agents: Record<string, AgentSpec>;
  current_agent: string;
}

export function resolveModel(
  phase: Phase,
  config: OriModelConfig,
  agent: string = config.current_agent,
): string {
  const phaseConfig = config.phases[phase];
  if (!phaseConfig) {
    throw new Error(`Unknown phase: ${phase}`);
  }
  if (phaseConfig.model_override) return phaseConfig.model_override;
  const agentSpec = config.agents[agent];
  if (!agentSpec) {
    throw new Error(`Unknown agent: ${agent}`);
  }
  const model = agentSpec.capability_to_model[phaseConfig.capability];
  if (!model) {
    throw new Error(
      `Agent "${agent}" has no model mapped for capability "${phaseConfig.capability}"`,
    );
  }
  return model;
}

/**
 * Default phase → capability mapping. Users may override via .ori/config.yaml.
 * Rationale:
 *   - derive/plan/test-red/impl-green need design judgement → deep
 *   - refactor/finalize are mechanical with brief AI commentary → fast
 *   - review is adversarial reasoning → reasoning (Opus/o1/etc.), fresh context
 */
export const DEFAULT_PHASE_CONFIG: Record<Phase, PhaseConfig> = {
  derive: { capability: "deep" },
  plan: { capability: "deep" },
  "test-red": { capability: "deep" },
  "impl-green": { capability: "deep" },
  refactor: { capability: "fast" },
  review: { capability: "reasoning", fresh_context: true },
  finalize: { capability: "fast" },
};

/**
 * Default agent definitions shipped with `ori init`.
 * Users may extend / override in .ori/config.yaml.
 */
export const DEFAULT_AGENTS: Record<string, AgentSpec> = {
  claude: {
    capability_to_model: {
      fast: "claude-haiku-4-5",
      deep: "claude-sonnet-4-6",
      reasoning: "claude-opus-4-7",
    },
    spawn: {
      binary: "claude",
      args: ["--model", "{model}", "--no-interactive", "--skill", "ori-{phase}", "{slice_id}"],
      mode: "headless",
    },
  },
  codex: {
    capability_to_model: {
      fast: "gpt-4o-mini",
      deep: "gpt-4o",
      reasoning: "o1",
    },
    spawn: {
      binary: "codex",
      args: ["run", "ori-{phase}", "--model", "{model}", "--slice", "{slice_id}"],
      mode: "headless",
    },
  },
  opencode: {
    // Default to DeepSeek family. OpenCode is provider-agnostic and
    // cost-conscious users typically pick DeepSeek as the budget pick.
    capability_to_model: {
      fast: "deepseek/deepseek-v4-flash",
      deep: "deepseek/deepseek-v4-pro",
      reasoning: "deepseek/deepseek-v4-pro",
    },
    spawn: {
      binary: "opencode",
      args: ["run", "--model", "{model}", "ori-{phase}", "{slice_id}"],
      mode: "headless",
    },
  },
  gemini: {
    capability_to_model: {
      fast: "gemini-2.0-flash",
      deep: "gemini-2.0-pro",
      reasoning: "gemini-2.0-pro-thinking",
    },
    spawn: {
      binary: "gemini",
      args: ["run", "--model", "{model}", "skill:ori-{phase}", "{slice_id}"],
      mode: "headless",
    },
  },
  cursor: {
    capability_to_model: {
      fast: "claude-haiku-4.5",
      deep: "claude-sonnet-4.6",
      reasoning: "claude-opus-4.7",
    },
    spawn: {
      mode: "manual",
      instructions:
        "Cursor does not expose a headless invocation. Open a new chat tab and run: /ori-{phase} {slice_id}  (model: {model})",
    },
  },
  copilot: {
    capability_to_model: {
      fast: "gpt-4o-mini",
      deep: "gpt-4o",
      reasoning: "claude-3.5-sonnet",
    },
    spawn: {
      mode: "manual",
      instructions:
        "In VSCode Copilot Chat, run: @workspace /ori-{phase} {slice_id}  (model: {model})",
    },
  },
};
