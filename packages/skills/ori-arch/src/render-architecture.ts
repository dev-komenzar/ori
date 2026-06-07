import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as yamlParse } from "yaml";
import { parseArchitectureSpec } from "@ori-ori/parser";
import { consola } from "consola";

const DEFAULT_BC = "task-management";

interface ParsedArgs {
  pattern: string;
  stack: string;
  app?: string;
  bc: string;
  bcRs?: string;
  dest: string;
  patternsDir?: string;
  force: boolean;
  help: boolean;
}

function usage(): string {
  return `Usage: render-architecture --pattern <name> --stack <name> [options]

Required:
  --pattern <name>       Pattern name (e.g. ddd-vsa-hex)
  --stack <name>         Stack name (e.g. typescript, typescript-tauri)

Options:
  --app <name>           Target app name. Overrides .ori/config.yaml
                         (workspace.apps[0].name).
  --bc <name>            Bounded context slice_root (kebab-case).
                         Default: ${DEFAULT_BC}
  --bc-rs <name>         Rust-side bounded context (snake_case).
                         Default: derived from --bc by kebab→snake.
  --dest <dir>           Destination directory. Default: current working directory.
  --patterns-dir <dir>   Patterns root. Overrides $ORI_PATTERNS_DIR and
                         the skill-bundled default.
  --force                Overwrite existing .ori/architecture.md.
  -h, --help             Show this help and exit.

Exit codes:
  0  success
  1  IO error (write failed, config.yaml unreadable, etc.)
  2  usage error (missing required arg, unknown pattern/stack, app name unresolved,
                  rendered spec invalid)
`;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    pattern: "",
    stack: "",
    bc: DEFAULT_BC,
    dest: process.cwd(),
    force: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const eq = a.indexOf("=");
    const key = eq === -1 ? a : a.slice(0, eq);
    const valInline = eq === -1 ? undefined : a.slice(eq + 1);
    const take = (): string => {
      if (valInline !== undefined) return valInline;
      const next = argv[++i];
      if (next === undefined) {
        process.stderr.write(`Missing value for ${key}\n\n` + usage());
        process.exit(2);
      }
      return next;
    };
    switch (key) {
      case "--pattern":      out.pattern = take(); break;
      case "--stack":        out.stack = take(); break;
      case "--app":          out.app = take(); break;
      case "--bc":           out.bc = take(); break;
      case "--bc-rs":        out.bcRs = take(); break;
      case "--dest":         out.dest = take(); break;
      case "--patterns-dir": out.patternsDir = take(); break;
      case "--force":        out.force = true; break;
      case "-h":
      case "--help":         out.help = true; break;
      default:
        process.stderr.write(`Unknown argument: ${a}\n\n` + usage());
        process.exit(2);
    }
  }
  return out;
}

function kebabToSnake(s: string): string {
  return s.replace(/-/g, "_");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
}

async function resolvePatternsDir(args: ParsedArgs): Promise<string> {
  const candidates: string[] = [];
  if (args.patternsDir) candidates.push(args.patternsDir);
  if (process.env.ORI_PATTERNS_DIR) candidates.push(process.env.ORI_PATTERNS_DIR);
  // bundled path: .apm/skills/ori-arch/scripts/render-architecture.js → .apm/contexts/patterns/
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(resolve(here, "..", "..", "..", "contexts", "patterns"));
  // ori repo dev fallback: packages/skills/ori-arch/src/render-architecture.ts (when run via vitest etc.)
  candidates.push(resolve(here, "..", "..", "..", "..", "..", ".apm", "contexts", "patterns"));

  for (const cand of candidates) {
    if (await exists(cand)) return resolve(cand);
  }
  const lines = [
    "Patterns directory not found. Searched:",
    ...candidates.map((c) => `  - ${c}`),
    "Set $ORI_PATTERNS_DIR or pass --patterns-dir <path>.",
  ];
  process.stderr.write(lines.join("\n") + "\n");
  process.exit(2);
}

async function resolveTemplate(patternsDir: string, pattern: string, stack: string): Promise<string> {
  const tplPath = join(patternsDir, pattern, "stacks", stack, "architecture.md.tpl");
  if (await exists(tplPath)) return tplPath;

  const patternDir = join(patternsDir, pattern);
  if (!(await exists(patternDir))) {
    const available = await listDirs(patternsDir);
    process.stderr.write(
      `Unknown pattern: "${pattern}"\n` +
      `Available patterns: ${available.length ? available.join(", ") : "(none found)"}\n`,
    );
    process.exit(2);
  }
  const stacksDir = join(patternDir, "stacks");
  const available = await listDirs(stacksDir);
  process.stderr.write(
    `Pattern "${pattern}" has no stack "${stack}".\n` +
    `Available stacks: ${available.length ? available.join(", ") : "(none found)"}\n`,
  );
  process.exit(2);
}

async function resolveAppName(dest: string, override: string | undefined): Promise<string> {
  if (override) return override;
  const configPath = join(dest, ".ori", "config.yaml");
  if (!(await exists(configPath))) {
    process.stderr.write(
      `Cannot resolve app name: ${relative(dest, configPath) || configPath} not found.\n` +
      `Pass --app <name> or run /ori-init first to create .ori/config.yaml.\n`,
    );
    process.exit(2);
  }
  let parsed: unknown;
  try {
    parsed = yamlParse(await readFile(configPath, "utf8"));
  } catch (err) {
    process.stderr.write(
      `Failed to parse ${relative(dest, configPath)}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
  const apps = (parsed as { ori?: { workspace?: { apps?: Array<{ name?: unknown }> } } })
    ?.ori?.workspace?.apps;
  const first = apps?.[0]?.name;
  if (typeof first !== "string" || first.trim() === "") {
    process.stderr.write(
      `No workspace.apps[0].name in ${relative(dest, configPath)}.\n` +
      `Pass --app <name> or fix the config.yaml.\n`,
    );
    process.exit(2);
  }
  return first;
}

function render(tpl: string, vars: Record<string, string>): string {
  let unresolved: string | null = null;
  const out = tpl.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const v = vars[key];
    if (v === undefined) {
      unresolved ??= whole;
      return whole;
    }
    return v;
  });
  if (unresolved) {
    process.stderr.write(`Template contains unresolved placeholder: ${unresolved}\n`);
    process.exit(2);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.pattern || !args.stack) {
    process.stderr.write("ERROR: --pattern and --stack are required\n\n" + usage());
    process.exit(2);
  }
  if (!(await exists(args.dest))) {
    process.stderr.write(`Destination does not exist: ${args.dest}\n`);
    process.exit(1);
  }
  const dest = resolve(args.dest);

  const patternsDir = await resolvePatternsDir(args);
  const tplPath = await resolveTemplate(patternsDir, args.pattern, args.stack);
  const appName = await resolveAppName(dest, args.app);
  const bcName = args.bc;
  const bcNameRs = args.bcRs ?? kebabToSnake(bcName);

  const tpl = await readFile(tplPath, "utf8");
  const rendered = render(tpl, {
    APP_NAME: appName,
    BC_NAME: bcName,
    BC_NAME_RS: bcNameRs,
  });

  try {
    parseArchitectureSpec(rendered);
  } catch (err) {
    process.stderr.write(
      `Rendered architecture.md failed validation: ${err instanceof Error ? err.message : String(err)}\n` +
      `Source template: ${relative(dest, tplPath) || tplPath}\n`,
    );
    process.exit(2);
  }

  const target = join(dest, ".ori", "architecture.md");
  if ((await exists(target)) && !args.force) {
    consola.warn(`Skipped (exists): ${relative(dest, target)}`);
    consola.info("Pass --force to overwrite.");
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, rendered, "utf8");

  consola.success(`Wrote ${relative(dest, target)}`);
  consola.info(`Pattern: ${args.pattern} / Stack: ${args.stack}`);
  consola.info(`App: ${appName} / BC: ${bcName}${args.stack.includes("tauri") ? ` / BC_RS: ${bcNameRs}` : ""}`);
}

await main();
