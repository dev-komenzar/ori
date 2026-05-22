import { defineCommand } from "citty";
import { consola } from "consola";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import {
  DEFAULT_AGENTS,
  DEFAULT_PHASE_CONFIG,
  PHASES,
  resolveModel,
  type OriModelConfig,
} from "@ori-ori/slice-runner";

async function loadConfig(): Promise<OriModelConfig> {
  try {
    const raw = await readFile(join(process.cwd(), ".ori/config.yaml"), "utf8");
    const data = yamlParse(raw);
    return data?.ori
      ? {
          phases: { ...DEFAULT_PHASE_CONFIG, ...(data.ori.workflow?.phases ?? {}) },
          agents: { ...DEFAULT_AGENTS, ...(data.ori.agents ?? {}) },
          current_agent: data.ori.current_agent ?? "claude",
        }
      : { phases: DEFAULT_PHASE_CONFIG, agents: DEFAULT_AGENTS, current_agent: "claude" };
  } catch {
    return { phases: DEFAULT_PHASE_CONFIG, agents: DEFAULT_AGENTS, current_agent: "claude" };
  }
}

const showCmd = defineCommand({
  meta: { name: "show", description: "Show current model assignments per phase" },
  async run() {
    const config = await loadConfig();
    consola.info(`Agent: ${config.current_agent}`);
    consola.info("Phase models:");
    for (const phase of PHASES) {
      const phaseConfig = config.phases[phase];
      const model = resolveModel(phase, config);
      const fresh = phaseConfig?.fresh_context ? " [fresh_context]" : "";
      consola.log(
        `  ${phase.padEnd(11)} ${model.padEnd(28)} (${phaseConfig?.capability})${fresh}`,
      );
    }
  },
});

export const modelCommand = defineCommand({
  meta: { name: "model", description: "Inspect and configure model assignments" },
  subCommands: { show: showCmd },
});
