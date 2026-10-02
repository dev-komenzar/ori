import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArchitectureSpec, type ArchitectureSpec } from "@ori-ori/parser";
import {
  bcName,
  initCommands,
  listApps,
  overall,
  resolveStack,
  RUNNER_DEPS,
  STACK_GUIDES,
  verify,
  type AppTarget,
  type Check,
} from "./internal/readiness.js";

// ── helpers ──────────────────────────────────────────────────────────

function usage(): never {
  console.error(
    "Usage: bootstrap.js guide  [--app <name>] [--spec <path>] [--json]\n" +
    "       bootstrap.js verify [--app <name>] [--spec <path>] [--skip-build] [--json]\n" +
    "  guide : stack を確定し upstream init / runner deps / scaffold のコマンドを提示 (実行しない)\n" +
    "  verify: readiness を静的 + build で検証 (exit 0=PASS / 1=FAIL)",
  );
  process.exit(2);
}

interface Args {
  cmd: "guide" | "verify";
  app?: string;
  spec: string;
  skipBuild: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const [cmd, ...rest] = argv;
  if (cmd !== "guide" && cmd !== "verify") usage();
  const args: Args = { cmd, spec: ".ori/architecture.md", skipBuild: false, json: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--app") args.app = rest[++i] ?? usage();
    else if (a === "--spec") args.spec = rest[++i] ?? usage();
    else if (a === "--skip-build") args.skipBuild = true;
    else if (a === "--json") args.json = true;
    else usage();
  }
  return args;
}

/** skill bundle は install 先で sibling 配置される (.claude/skills/<skill>/scripts/)。 */
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const rel = (p: string) => {
  const r = relative(process.cwd(), p);
  return r.startsWith("..") ? p : r;
};
const SELF = rel(join(SCRIPT_DIR, "bootstrap.js"));
const SCAFFOLD = rel(join(SCRIPT_DIR, "..", "..", "ori-init", "scripts", "install-tauri-scaffold.sh"));

function loadSpec(path: string): ArchitectureSpec | Check {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {
      id: "spec.architecture-md", level: "fail",
      message: `${path} が無い`,
      fix: "/ori-architect で .ori/architecture.md を生成 (bootstrap は architect の後段)",
    };
  }
  try {
    return parseArchitectureSpec(raw);
  } catch (err) {
    return {
      id: "spec.architecture-md", level: "fail",
      message: `${path} の parse に失敗: ${(err as Error).message.split("\n")[0]}`,
      fix: "/ori-architect で再生成、または node .apm/skills/ori-doctor/scripts/lint.js .ori で確認",
    };
  }
}

function selectApps(spec: ArchitectureSpec, name?: string): AppTarget[] {
  const apps = listApps(spec);
  if (!name) return apps;
  const hit = apps.filter((a) => a.name === name);
  if (hit.length === 0) {
    console.error(`app "${name}" は architecture.md に無い (候補: ${apps.map((a) => a.name).join(", ") || "なし"})`);
    process.exit(2);
  }
  return hit;
}

const MARK: Record<Check["level"], string> = { pass: "PASS", fail: "FAIL", warn: "WARN", skip: "SKIP" };

function printChecks(checks: Check[]): void {
  for (const c of checks) {
    const scope = c.app ? `${c.app}:` : "";
    console.log(`${MARK[c.level]}  [${scope}${c.id}] ${c.message}`);
    if (c.fix && c.level !== "pass") console.log(`      fix: ${c.fix}`);
  }
}

// ── guide ────────────────────────────────────────────────────────────

function guide(spec: ArchitectureSpec, apps: AppTarget[], json: boolean): number {
  const runner = spec.scenario_test_runner?.runner;
  const runnerDeps = runner ? RUNNER_DEPS[runner] : undefined;
  const plans = apps.map((app) => {
    const stack = resolveStack(spec, app);
    return {
      app: app.name,
      path: app.path,
      stack,
      doc: stack ? STACK_GUIDES[stack].doc : "docs/start/index.md",
      upstream_init: stack ? initCommands(stack, app) : null,
      tauri_scaffold: stack === "typescript-tauri"
        ? `bash ${SCAFFOLD} --dest . --app-name ${app.name} --bc-name ${bcName(spec, app) ?? "<bc-kebab>"}`
        : null,
    };
  });
  const runnerStep = runnerDeps ? `pnpm add -D ${runnerDeps.join(" ")}` : null;
  const verifyStep = `node ${SELF} verify`;

  if (json) {
    console.log(JSON.stringify({ apps: plans, runner: runner ?? null, runner_deps: runnerStep, verify: verifyStep }, null, 2));
    return plans.some((p) => !p.stack) ? 1 : 0;
  }
  for (const p of plans) {
    console.log(`## ${p.app} (${p.path})  stack=${p.stack ?? "未対応"}  guide=${p.doc}`);
    if (!p.upstream_init) {
      console.log("  roots の language 構成が未対応 stack。docs/start/index.md を確認\n");
      continue;
    }
    console.log("  1. upstream framework init (ユーザが project root で実行。skill は自動実行しない)");
    console.log(`     ${p.upstream_init}`);
    if (p.tauri_scaffold) {
      console.log("  2. tauri specta scaffold (src-tauri 作成後に apply)");
      console.log(`     ${p.tauri_scaffold}`);
    }
    console.log("");
  }
  if (runnerStep) {
    console.log(`## runner deps (${runner}) — project root で実行`);
    console.log(`     ${runnerStep}\n`);
  } else if (runner) {
    console.log(`## runner deps — 未知の runner "${runner}" (手動で確認)\n`);
  }
  console.log("## readiness verify");
  console.log(`     ${verifyStep}`);
  return plans.some((p) => !p.stack) ? 1 : 0;
}

// ── main ─────────────────────────────────────────────────────────────

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const loaded = loadSpec(args.spec);
  if (!("version" in loaded)) {
    if (args.json) console.log(JSON.stringify({ result: "FAIL", checks: [loaded] }, null, 2));
    else {
      printChecks([loaded]);
      console.log("\nRESULT: FAIL");
    }
    return 1;
  }
  const apps = selectApps(loaded, args.app);
  if (apps.length === 0) {
    const c: Check = {
      id: "spec.workspace", level: "fail",
      message: "architecture.md に app が宣言されていない (workspace.apps / roots[].app)",
      fix: "/ori-architect で workspace.apps を含めて再生成",
    };
    if (args.json) console.log(JSON.stringify({ result: "FAIL", checks: [c] }, null, 2));
    else {
      printChecks([c]);
      console.log("\nRESULT: FAIL");
    }
    return 1;
  }

  if (args.cmd === "guide") return guide(loaded, apps, args.json);

  const checks = verify({
    projectRoot: process.cwd(),
    spec: loaded,
    apps,
    skipBuild: args.skipBuild,
    scaffoldScript: SCAFFOLD,
  });
  const result = overall(checks);
  if (args.json) console.log(JSON.stringify({ result, checks }, null, 2));
  else {
    printChecks(checks);
    console.log(`\nRESULT: ${result}${args.skipBuild ? " (static only)" : ""}`);
  }
  return result === "PASS" ? 0 : 1;
}

process.exit(main());
