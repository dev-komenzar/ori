import { defineCommand } from "citty";
import { initCommand } from "./commands/init.js";
import { lintCommand } from "./commands/lint.js";
import { syncCommand } from "./commands/sync.js";
import { sliceCommand } from "./commands/slice.js";
import { pageCommand } from "./commands/page.js";
import { modelCommand } from "./commands/model.js";
import { proposalsCommand } from "./commands/proposals.js";
import { archCommand } from "./commands/arch.js";

export const main = defineCommand({
  meta: {
    name: "ori",
    version: "0.0.1",
    description:
      "ori (織) — DDD-driven slice/page scaffolding with CoDD coherence + per-slice TDD",
  },
  subCommands: {
    init: initCommand,
    lint: lintCommand,
    sync: syncCommand,
    slice: sliceCommand,
    page: pageCommand,
    model: modelCommand,
    proposals: proposalsCommand,
    arch: archCommand,
  },
});

export default main;
