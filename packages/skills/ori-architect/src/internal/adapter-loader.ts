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

/**
 * Resolve the adapters bundle directory.
 *   1. explicit --adapters-dir CLI override
 *   2. bundle-adjacent: scripts/<bundle>.js → ../adapters/
 *      (works for ori repo dev, apm install layout, and Claude Code install
 *      — anywhere the skill bundle lives, adapters/ is its sibling)
 */
export async function resolveAdaptersDir(
  opts: ResolveAdaptersDirOptions,
): Promise<string> {
  const candidates: string[] = [];
  if (opts.adaptersDir) candidates.push(opts.adaptersDir);
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(resolve(here, "..", "adapters"));

  for (const cand of candidates) {
    if (await exists(cand)) return resolve(cand);
  }
  const lines = [
    "Adapters directory not found. Searched:",
    ...candidates.map((c) => `  - ${c}`),
    "Pass --adapters-dir <path> to override.",
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
