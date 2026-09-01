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
  scenarioTestRunner?: string;
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
  --patterns-dir <dir>   Patterns root. Overrides the skill-bundled default.
  --scenario-test-runner <name>
                         Scenario test runner (e.g. playwright, cypress, detox).
                         Default: auto-inferred from stack (web→playwright, etc.)
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
      case "--scenario-test-runner": out.scenarioTestRunner = take(); break;
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

/**
 * Infer scenario test runner from stack name.
 * - web / typescript → playwright
 * - typescript-tauri → playwright (web UI) + tauri-driver (native)
 * - mobile stacks → detox / appium
 * Returns undefined if no inference is possible.
 */
function inferScenarioTestRunner(stack: string): string | undefined {
  const s = stack.toLowerCase();
  if (s.includes("tauri")) return "playwright";
  if (s.includes("next") || s.includes("nuxt") || s.includes("remix") || s.includes("astro")) return "playwright";
  if (s.includes("react") || s.includes("vue") || s.includes("angular") || s.includes("svelte")) return "playwright";
  if (s.includes("web") || s === "typescript" || s === "javascript") return "playwright";
  if (s.includes("detox")) return "detox";
  if (s.includes("appium")) return "appium";
  if (s.includes("cypress")) return "cypress";
  return undefined;
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

/**
 * Resolve the patterns bundle directory.
 *   1. explicit --patterns-dir CLI override
 *   2. bundle-adjacent: scripts/render-architecture.js → ../patterns/
 *      (works for ori repo dev, apm install layout, and Claude Code install
 *      — anywhere the skill bundle lives, patterns/ is its sibling)
 */
async function resolvePatternsDir(args: ParsedArgs): Promise<string> {
  const candidates: string[] = [];
  if (args.patternsDir) candidates.push(args.patternsDir);
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(resolve(here, "..", "patterns"));

  for (const cand of candidates) {
    if (await exists(cand)) return resolve(cand);
  }
  const lines = [
    "Patterns directory not found. Searched:",
    ...candidates.map((c) => `  - ${c}`),
    "Pass --patterns-dir <path> to override.",
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
  const stackDir = join(stacksDir, stack);
  if (await exists(stackDir)) {
    // ori-c79: 固定 tpl は ori-architect スキルの動的生成へ移行済み。
    // この stack に tpl が無いのは「未実装」ではなく「agent 生成が前提」。
    process.stderr.write(
      `Pattern "${pattern}" / stack "${stack}" に architecture.md.tpl がありません.\n` +
      `DDD + vsa-hex の architecture.md は ori-architect スキルが要件対話から生成します\n` +
      `(.apm/skills/ori-architect/SKILL.md の questions / generation_procedure を参照).\n` +
      `参照用に tpl を保持している bundle を使う場合は --patterns-dir <path> を指定してください.\n`,
    );
    process.exit(2);
  }
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

/**
 * Inject scenario_test_runner into the frontmatter of rendered architecture.md.
 * Inserts after cross_slice section (or at end of frontmatter if cross_slice not found).
 */
function injectScenarioTestRunner(content: string, runner: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inFrontmatter = false;
  let frontmatterEnd = -1;
  let injected = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        result.push(lines[i]!);
      } else {
        if (!injected) {
          result.push(`scenario_test_runner:`);
          result.push(`  runner: ${runner}`);
          injected = true;
        }
        result.push(lines[i]!);
        frontmatterEnd = i;
        break;
      }
    } else if (inFrontmatter) {
      result.push(lines[i]!);
    } else {
      result.push(lines[i]!);
    }
  }

  for (let i = frontmatterEnd + 1; i < lines.length; i++) {
    result.push(lines[i]!);
  }

  return result.join("\n");
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
  let rendered = render(tpl, {
    APP_NAME: appName,
    BC_NAME: bcName,
    BC_NAME_RS: bcNameRs,
  });

  const scenarioRunner = args.scenarioTestRunner ?? inferScenarioTestRunner(args.stack);
  if (scenarioRunner) {
    rendered = injectScenarioTestRunner(rendered, scenarioRunner);
  }

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
  if (scenarioRunner) {
    consola.info(`Scenario Test Runner: ${scenarioRunner}${args.scenarioTestRunner ? " (user override)" : " (auto-inferred)"}`);
  }
}

await main();
