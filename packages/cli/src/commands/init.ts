import { defineCommand } from "citty";
import { consola } from "consola";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { DEFAULT_AGENTS, DEFAULT_PHASE_CONFIG } from "@ori-ori/slice-runner";
import { seedDomainScaffolds } from "../utils/domain-scaffold.js";

const DIRS = [
  ".ori/domain/workflows",
  ".ori/domain/ui-fields",
  ".ori/domain/code",
  ".ori/slices",
  ".ori/pages",
  ".ori/proposals",
  ".ori/state",
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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

    for (const dir of DIRS) {
      await mkdir(join(cwd, dir), { recursive: true });
    }

    const gitkeepDirs = [".ori/slices", ".ori/pages", ".ori/proposals"];
    for (const dir of gitkeepDirs) {
      const gitkeepPath = join(cwd, dir, ".gitkeep");
      if (!(await exists(gitkeepPath))) {
        await writeFile(gitkeepPath, "", "utf8");
      }
    }

    const configPath = join(cwd, ".ori/config.yaml");
    const configExists = await exists(configPath);
    if (configExists && !args.force) {
      consola.warn(".ori/config.yaml already exists. Use --force to overwrite.");
    } else {
      const config = {
        ori: {
          version: 1,
          workflow: { phases: DEFAULT_PHASE_CONFIG },
          agents: DEFAULT_AGENTS,
          current_agent: "claude",
        },
      };
      await writeFile(configPath, yamlStringify(config), "utf8");
      consola.success("Wrote .ori/config.yaml with defaults (current_agent: claude)");
    }

    const gitignorePath = join(cwd, ".ori/.gitignore");
    if (!(await exists(gitignorePath))) {
      await writeFile(gitignorePath, "state/\n", "utf8");
    }

    const scaffold = await seedDomainScaffolds({ cwd, force: args.force });
    if (scaffold.written.length > 0) {
      consola.success(
        `Seeded ${scaffold.written.length} domain scaffold file(s) under .ori/domain/`,
      );
    }
    if (scaffold.skipped.length > 0) {
      consola.info(
        `Skipped ${scaffold.skipped.length} existing scaffold file(s) (use --force to overwrite).`,
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
