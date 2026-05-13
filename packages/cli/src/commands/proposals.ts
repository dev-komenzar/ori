import { defineCommand } from "citty";
import { consola } from "consola";

export const proposalsCommand = defineCommand({
  meta: {
    name: "proposals",
    description: "List or review reverse-propagation proposals waiting for human decision",
  },
  args: {
    check: {
      type: "boolean",
      description: "Exit non-zero if any unresolved proposals exist (CI mode)",
      default: false,
    },
  },
  async run({ args }) {
    consola.info("ori proposals (MVP stub) — list .ori/proposals/*.md");
    if (args.check) process.exit(0);
  },
});
