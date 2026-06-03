import { defineCommand } from "citty";
import { consola } from "consola";
import { createSkeleton } from "@ori-ori/init-core";

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Initialize .ori/ skeleton in the current project (silent — no template scaffold)",
  },
  args: {
    force: {
      type: "boolean",
      description: "Overwrite existing files if present",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    consola.start(`Initializing ori workspace at ${cwd}`);

    const result = await createSkeleton({ cwd, force: args.force });

    if (result.configWritten) {
      consola.success(
        `Wrote .ori/config.yaml with defaults (app: ${result.appName}, current_agent: claude)`,
      );
    } else if (result.configAlreadyExisted) {
      consola.warn(".ori/config.yaml already exists. Use --force to overwrite.");
    }

    if (result.scaffold.written.length > 0) {
      consola.success(
        `Seeded ${result.scaffold.written.length} domain scaffold file(s) under .ori/domain/`,
      );
    }
    if (result.scaffold.skipped.length > 0) {
      consola.info(
        `Skipped ${result.scaffold.skipped.length} existing scaffold file(s) (use --force to overwrite).`,
      );
    }

    const steps = [
      "apm install dev-komenzar/ori   # install skills/instructions/agents into your harness",
      "/ori-distill                   # AI-guided DDD phase 1-11  (requires step 1)",
      "/ori-arch                      # decide pattern & framework, scaffold project code",
      "ori slice new <id>             # bootstrap a slice (1 use case = 1 handler)",
      "ori page new <id>              # bootstrap a page (UI composition of N slices)",
    ];

    const nextSteps = [
      "ori workspace ready.",
      "",
      "Next steps:",
      ...steps.map((s, i) => `  ${i + 1}. ${s}`),
    ];
    consola.box(nextSteps.join("\n"));
  },
});
