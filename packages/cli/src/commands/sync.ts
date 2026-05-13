import { defineCommand } from "citty";
import { consola } from "consola";

export const syncCommand = defineCommand({
  meta: {
    name: "sync",
    description: "Detect changes and propagate dirty marks across the coherence graph",
  },
  args: {
    file: {
      type: "string",
      description: "Limit detection to a single file",
      required: false,
    },
    since: {
      type: "string",
      description: "Compare against the given git ref instead of HEAD",
      required: false,
    },
    check: {
      type: "boolean",
      description: "Exit non-zero if any dirty marks remain (CI mode)",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Allow editing derived docs; auto-generate proposals",
      default: false,
    },
  },
  async run({ args }) {
    consola.info(`ori sync (MVP stub) — file=${args.file ?? "<all>"} since=${args.since ?? "HEAD"}`);
    consola.warn("Detection + graph propagation not wired yet. Coming in next milestone.");
    if (args.check) process.exit(0);
  },
});
