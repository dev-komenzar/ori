import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { OriArchAdapter } from "@ori-ori/parser";
import { consola } from "consola";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(p: string): Promise<string[]> {
  try {
    const entries = await readdir(p, { withFileTypes: true });
    return entries
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

export interface ResolveAdaptersDirOptions {
  /** --adapters-dir <dir> CLI override */
  adaptersDir?: string | undefined;
}

async function findApmModulesAdapters(cwd: string): Promise<string[]> {
  const apmModules = join(cwd, "apm_modules");
  if (!(await exists(apmModules))) return [];
  const found: string[] = [];
  const owners = await listDirs(apmModules);
  for (const owner of owners) {
    const repos = await listDirs(join(apmModules, owner));
    for (const repo of repos) {
      const cand = join(apmModules, owner, repo, ".apm", "contexts", "adapters");
      if (await exists(cand)) found.push(cand);
    }
  }
  return found;
}

/**
 * Resolve the adapters bundle directory.
 *   1. explicit CLI flag
 *   2. $ORI_ADAPTERS_DIR env var
 *   3. bundle-adjacent (ori repo dev: .apm/skills/ori-arch/scripts/<bundle>.js
 *      → .apm/contexts/adapters/)
 *   4. consumer cwd: apm_modules/<owner>/<repo>/.apm/contexts/adapters/
 *      (apm install layout — adapters live in the package cache, NOT in
 *      .github/skills/ alongside the skill bundle)
 *   5. legacy parent-of-repo fallback
 */
export async function resolveAdaptersDir(
  opts: ResolveAdaptersDirOptions,
): Promise<string> {
  const candidates: string[] = [];
  if (opts.adaptersDir) candidates.push(opts.adaptersDir);
  if (process.env.ORI_ADAPTERS_DIR) candidates.push(process.env.ORI_ADAPTERS_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(resolve(here, "..", "..", "..", "contexts", "adapters"));
  for (const found of await findApmModulesAdapters(process.cwd())) {
    candidates.push(found);
  }
  candidates.push(
    resolve(here, "..", "..", "..", "..", "..", ".apm", "contexts", "adapters"),
  );

  for (const cand of candidates) {
    if (await exists(cand)) return resolve(cand);
  }
  const lines = [
    "Adapters directory not found. Searched:",
    ...candidates.map((c) => `  - ${c}`),
    "Set $ORI_ADAPTERS_DIR or pass --adapters-dir <path>.",
  ];
  process.stderr.write(lines.join("\n") + "\n");
  process.exit(2);
}

export async function loadAdapter(
  name: string,
  adaptersDir: string,
): Promise<OriArchAdapter> {
  const adapterDir = join(adaptersDir, name);
  const entry = join(adapterDir, "index.js");
  if (!(await exists(entry))) {
    const available = await listDirs(adaptersDir);
    consola.error(`Adapter "${name}" not found at ${entry}`);
    consola.info(
      `Available adapters: ${available.length ? available.join(", ") : "(none found)"}`,
    );
    consola.info(
      "If you installed via APM, ensure your bundle is up to date (apm install dev-komenzar/ori).",
    );
    process.exit(2);
  }
  const mod = (await import(pathToFileURL(entry).href)) as { default?: unknown };
  const adapter = (mod.default ?? mod) as OriArchAdapter;
  if (!adapter || typeof adapter.export !== "function") {
    consola.error(
      `Adapter at ${entry} does not export a valid OriArchAdapter (missing export()).`,
    );
    process.exit(2);
  }
  return adapter;
}
