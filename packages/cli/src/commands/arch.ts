import { defineCommand } from "citty";
import { consola } from "consola";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseArchitectureSpec,
  type ArchitectureSpec,
  type OriArchAdapter,
  type RootConfig,
} from "@ori-ori/parser";

const DEFAULT_SPEC_PATH = ".ori/architecture.md";

async function loadSpec(cwd: string, specArg: string | undefined): Promise<{
  spec: ArchitectureSpec;
  path: string;
}> {
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
  // Resolve from the user's project, not from where ori itself is installed.
  // createRequire's resolver honors CJS conditions; adapter packages must
  // therefore declare a "default" entry in their exports field so the file
  // can be located. The dynamic import() then loads it as ESM.
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

const exportCmd = defineCommand({
  meta: {
    name: "export",
    description: "Compile .ori/architecture.md into a native linter config via an adapter",
  },
  args: {
    spec: {
      type: "string",
      description: "Path to the architecture spec (default: .ori/architecture.md)",
      required: false,
    },
    adapter: {
      type: "string",
      description: "Adapter name suffix (overrides the root's `adapter` field)",
      required: false,
    },
    root: {
      type: "string",
      description: "Root id to export (multi-root projects)",
      required: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Print files to stdout instead of writing",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { spec } = await loadSpec(cwd, args.spec);
    const root = resolveRoot(spec, args.root);
    const adapterName = args.adapter ?? root.adapter;

    const adapter = await loadAdapter(cwd, adapterName);
    const result = await adapter.export(spec, root);

    if (result.files.length === 0) {
      consola.warn(`Adapter "${adapterName}" produced no files.`);
    }

    for (const file of result.files) {
      const abs = join(cwd, file.path);
      if (args["dry-run"]) {
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
  },
});

const checkCmd = defineCommand({
  meta: {
    name: "check",
    description: "Run the adapter's native linter against the current project",
  },
  args: {
    spec: {
      type: "string",
      description: "Path to the architecture spec (default: .ori/architecture.md)",
      required: false,
    },
    adapter: {
      type: "string",
      description: "Adapter name suffix (overrides the root's `adapter` field)",
      required: false,
    },
    root: {
      type: "string",
      description: "Root id to check (multi-root projects)",
      required: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { spec } = await loadSpec(cwd, args.spec);
    const root = resolveRoot(spec, args.root);
    const adapterName = args.adapter ?? root.adapter;

    const adapter = await loadAdapter(cwd, adapterName);
    if (!adapter.check) {
      consola.error(
        `Adapter "${adapterName}" does not implement check(). Run \`ori arch export --adapter=${adapterName}\` and use the native linter directly.`,
      );
      process.exit(2);
    }

    const result = await adapter.check(spec, root);
    if (result.violations.length === 0) {
      consola.success(`No architecture violations in root "${root.id}".`);
      return;
    }
    for (const v of result.violations) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      consola.warn(`${loc}  [${v.rule}] ${v.message}`);
    }
    consola.error(`${result.violations.length} violation(s) found`);
    process.exit(1);
  },
});

export const archCommand = defineCommand({
  meta: {
    name: "arch",
    description: "Compile .ori/architecture.md to native linter configs via adapters",
  },
  subCommands: {
    export: exportCmd,
    check: checkCmd,
  },
});
