import { defineCommand } from "citty";
import { initCommand } from "./commands/init.js";
import { lintCommand } from "./commands/lint.js";
import { syncCommand } from "./commands/sync.js";
import { featureCommand } from "./commands/feature.js";
import { modelCommand } from "./commands/model.js";
import { proposalsCommand } from "./commands/proposals.js";

export const main = defineCommand({
  meta: {
    name: "ori",
    version: "0.0.1",
    description:
      "ori (織) — DDD-driven feature scaffolding with CoDD coherence + per-feature TDD",
  },
  subCommands: {
    init: initCommand,
    lint: lintCommand,
    sync: syncCommand,
    feature: featureCommand,
    model: modelCommand,
    proposals: proposalsCommand,
  },
});

export default main;
