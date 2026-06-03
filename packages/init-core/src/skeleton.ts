import { mkdir, writeFile, access } from "node:fs/promises";
import { basename, join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { DEFAULT_AGENTS, DEFAULT_PHASE_CONFIG } from "@ori-ori/slice-runner";
import {
  seedDomainScaffolds,
  type SeedDomainScaffoldResult,
} from "./domain-scaffold.js";

const DIRS = [
  ".ori/domain/workflows",
  ".ori/domain/ui-fields",
  ".ori/domain/code",
  ".ori/slices",
  ".ori/pages",
  ".ori/proposals",
  ".ori/state",
];

const GITKEEP_DIRS = [".ori/slices", ".ori/pages", ".ori/proposals"];

export interface CreateSkeletonOptions {
  readonly cwd: string;
  readonly force?: boolean;
}

export interface CreateSkeletonResult {
  readonly appName: string;
  readonly configWritten: boolean;
  readonly configAlreadyExisted: boolean;
  readonly scaffold: SeedDomainScaffoldResult;
}

export function deriveAppName(cwd: string): string {
  const folder = basename(cwd);
  const sanitized = folder
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "app";
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function createSkeleton(
  opts: CreateSkeletonOptions,
): Promise<CreateSkeletonResult> {
  const { cwd } = opts;
  const force = opts.force ?? false;

  for (const dir of DIRS) {
    await mkdir(join(cwd, dir), { recursive: true });
  }

  for (const dir of GITKEEP_DIRS) {
    const gitkeepPath = join(cwd, dir, ".gitkeep");
    if (!(await exists(gitkeepPath))) {
      await writeFile(gitkeepPath, "", "utf8");
    }
  }

  const appName = deriveAppName(cwd);
  const configPath = join(cwd, ".ori/config.yaml");
  const configAlreadyExisted = await exists(configPath);
  let configWritten = false;
  if (!configAlreadyExisted || force) {
    const config = {
      ori: {
        version: 1,
        workspace: {
          apps_root: "apps",
          apps: [
            {
              name: appName,
              path: `apps/${appName}`,
            },
          ],
        },
        workflow: { phases: DEFAULT_PHASE_CONFIG },
        agents: DEFAULT_AGENTS,
        current_agent: "claude",
      },
    };
    await writeFile(configPath, yamlStringify(config), "utf8");
    configWritten = true;
  }

  const gitignorePath = join(cwd, ".ori/.gitignore");
  if (!(await exists(gitignorePath))) {
    await writeFile(gitignorePath, "state/\n", "utf8");
  }

  const scaffold = await seedDomainScaffolds({ cwd, force });

  return { appName, configWritten, configAlreadyExisted, scaffold };
}
