import { defineCommand } from "citty";
import { consola } from "consola";
import { mkdir, writeFile, access } from "node:fs/promises";
import { basename, join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { DEFAULT_AGENTS, DEFAULT_PHASE_CONFIG } from "@ori-ori/feature-runner";
import {
  AVAILABLE_TEMPLATES,
  copyTemplate,
  isKnownTemplate,
  resolveTemplateRoot,
} from "../utils/templates.js";
import { seedDomainScaffolds } from "../utils/domain-scaffold.js";
import { bootstrapTauriProject } from "../utils/tauri-bootstrap.js";

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
      description: `Code-generation template to scaffold (one of: ${AVAILABLE_TEMPLATES.join(", ")}). Default: none — domain docs only`,
      required: false,
    },
    force: {
      type: "boolean",
      description: "Overwrite existing files if present",
      default: false,
    },
    "skip-tauri-init": {
      type: "boolean",
      description:
        "(ddd-typescript-tauri only) Skip the 'pnpm install' + 'pnpm tauri init' shell-out. Use when you want to run it yourself or when the toolchain is unavailable.",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    consola.start(`Initializing ori workspace at ${cwd}`);

    if (args.template && !isKnownTemplate(args.template)) {
      consola.error(
        `Unknown template "${args.template}". Available: ${AVAILABLE_TEMPLATES.join(", ")}`,
      );
      process.exit(2);
    }

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

    if (args.template && isKnownTemplate(args.template)) {
      const src = resolveTemplateRoot(args.template);
      consola.start(`Copying template "${args.template}" into project root`);
      const copy = await copyTemplate({ src, dest: cwd, force: args.force });
      consola.success(
        `Template "${args.template}": wrote ${copy.written.length} file(s)` +
          (copy.skipped.length > 0
            ? `, skipped ${copy.skipped.length} (use --force to overwrite)`
            : ""),
      );

      if (args.template === "ddd-typescript-tauri") {
        const skipTauriInit =
          Boolean(args["skip-tauri-init"]) ||
          process.env.ORI_INIT_SKIP_TAURI_INIT === "1";
        if (skipTauriInit) {
          consola.info(
            "Skipped 'pnpm install' + 'pnpm tauri init' (per --skip-tauri-init).",
          );
          consola.info(
            "Run them yourself: pnpm install && pnpm tauri init --ci --directory src-tauri ...",
          );
        } else {
          consola.start(
            "Bootstrapping Tauri project (pnpm install + pnpm tauri init --ci)",
          );
          try {
            const bootstrap = await bootstrapTauriProject({
              cwd,
              appName: basename(cwd),
            });
            for (const step of bootstrap.steps) consola.success(step);
          } catch (err) {
            consola.error(
              `Tauri bootstrap failed: ${(err as Error).message}\n` +
                "You can re-run it manually:\n" +
                "  pnpm install\n" +
                "  pnpm tauri init --ci --app-name <name> --directory src-tauri ...",
            );
            process.exit(3);
          }
        }
      }
    }

    const steps: string[] = [];
    if (args.template === "ddd-typescript") {
      steps.push("pnpm install                   # install template deps");
    }
    if (args.template === "ddd-typescript-tauri" && args["skip-tauri-init"]) {
      steps.push(
        "pnpm install && pnpm tauri init --ci --directory src-tauri ...  # finish tauri scaffolding",
      );
    }
    steps.push("apm install dev-komenzar/ori   # install skills/instructions/hooks");
    steps.push("/ori-distill                   # AI-guided DDD phase 1-11");
    steps.push("ori feature new <id>           # bootstrap a feature");

    const nextSteps = [
      "ori workspace ready.",
      "",
      "Next steps:",
      ...steps.map((s, i) => `  ${i + 1}. ${s}`),
    ];
    consola.box(nextSteps.join("\n"));
  },
});
