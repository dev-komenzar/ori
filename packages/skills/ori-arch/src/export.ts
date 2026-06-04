import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArchitectureSpec, type ArchitectureSpec, type OriArchAdapter, type RootConfig } from "@ori-ori/parser";
import { consola } from "consola";

const DEFAULT_SPEC_PATH = ".ori/architecture.md";

async function loadSpec(cwd: string, specArg: string | undefined): Promise<{ spec: ArchitectureSpec; path: string }> {
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

function resolveRoot(spec: ArchitectureSpec, requestedId: string | undefined): RootConfig {
  const targetId = requestedId ?? spec.default_root;
  const root = spec.roots.find((r) => r.id === targetId);
  if (!root) {
    const known = spec.roots.map((r) => r.id).join(", ");
    consola.error(`Unknown root "${targetId}". Available roots: ${known}`);
    process.exit(2);
  }
  return root;
}

async function loadAdapter(cwd: string, name: string): Promise<OriArchAdapter> {
  const pkg = `@ori-ori/arch-adapter-${name}`;
  const require = createRequire(join(cwd, "package.json"));
  let mod: unknown;
  try {
    const resolved = require.resolve(pkg);
    mod = await import(pathToFileURL(resolved).href);
  } catch (err) {
    consola.error(`Adapter package "${pkg}" is not installed in ${cwd}.`);
    consola.info(`Install it with: pnpm add -D ${pkg}`);
    consola.info(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
  const adapter = ((mod as { default?: unknown }).default ?? mod) as OriArchAdapter;
  if (!adapter || typeof adapter.export !== "function") {
    consola.error(`Adapter "${pkg}" does not export a valid OriArchAdapter (missing export()).`);
    process.exit(2);
  }
  return adapter;
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

const adapter = await loadAdapter(cwd, adapterName);
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
