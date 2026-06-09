import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  parseArchitectureSpec,
  type ArchitectureSpec,
  type RootConfig,
} from "@ori-ori/parser";
import { consola } from "consola";
import { loadAdapter, resolveAdaptersDir } from "./internal/adapter-loader.js";

const DEFAULT_SPEC_PATH = ".ori/architecture.md";

async function loadSpec(
  cwd: string,
  specArg: string | undefined,
): Promise<{ spec: ArchitectureSpec; path: string }> {
  const specPath = join(cwd, specArg ?? DEFAULT_SPEC_PATH);
  try {
    await stat(specPath);
  } catch {
    consola.error(`Spec not found: ${relative(cwd, specPath)}`);
    process.exit(2);
  }
  const raw = await readFile(specPath, "utf8");
  try {
    return { spec: parseArchitectureSpec(raw), path: specPath };
  } catch (err) {
    consola.error(`Failed to parse ${relative(cwd, specPath)}:`);
    consola.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

function resolveRoot(
  spec: ArchitectureSpec,
  requestedId: string | undefined,
): RootConfig {
  const targetId = requestedId ?? spec.default_root;
  const root = spec.roots.find((r) => r.id === targetId);
  if (!root) {
    const known = spec.roots.map((r) => r.id).join(", ");
    consola.error(`Unknown root "${targetId}". Available roots: ${known}`);
    process.exit(2);
  }
  return root;
}

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  const a = args[idx]!;
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  return args[idx + 1];
}
function boolFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const cwd = process.cwd();
const { spec } = await loadSpec(cwd, flag("spec"));
const root = resolveRoot(spec, flag("root"));
const adapterName = flag("adapter") ?? root.adapter;
const dryRun = boolFlag("dry-run");

const adaptersDir = await resolveAdaptersDir({ adaptersDir: flag("adapters-dir") });
const adapter = await loadAdapter(adapterName, adaptersDir);
const result = await adapter.export(spec, root);

if (result.files.length === 0) {
  consola.warn(`Adapter "${adapterName}" produced no files.`);
}

for (const file of result.files) {
  const abs = join(cwd, file.path);
  if (dryRun) {
    consola.info(`--- ${file.path} ---`);
    process.stdout.write(file.content);
    if (!file.content.endsWith("\n")) process.stdout.write("\n");
  } else {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.content, "utf8");
    consola.success(`Wrote ${file.path}`);
  }
}

for (const note of result.notes ?? []) {
  consola.info(note);
}
