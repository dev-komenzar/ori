import { defineCommand } from "citty";
import { consola } from "consola";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { DEFAULT_AGENTS, DEFAULT_PHASE_CONFIG } from "@ori-ori/feature-runner";

const DIRS = [
  ".ori/domain/workflows",
  ".ori/domain/ui-fields",
  ".ori/domain/code",
  ".ori/features",
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
    description: "Initialize .ori/ structure in the current project",
  },
  args: {
    template: {
      type: "string",
      description:
        "Code-generation template to scaffold (default: none — domain docs only)",
      required: false,
    },
    force: {
      type: "boolean",
      description: "Overwrite existing config.yaml if present",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    consola.start(`Initializing ori workspace at ${cwd}`);

    for (const dir of DIRS) {
      await mkdir(join(cwd, dir), { recursive: true });
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

    if (args.template) {
      consola.info(
        `Template "${args.template}" requested. Template copy is not implemented yet (MVP). See @ori-ori/templates.`,
      );
    }

    consola.box([
      "ori workspace ready.",
      "",
      "Next steps:",
      "  1. apm install dev-komenzar/ori   # install skills/instructions/hooks",
      "  2. /ori-distill                   # AI-guided DDD phase 1-11",
      "  3. ori feature new <id>           # bootstrap a feature",
    ].join("\n"));
  },
});
