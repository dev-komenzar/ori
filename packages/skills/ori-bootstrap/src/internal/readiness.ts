import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AppRuntime, ArchitectureSpec } from "@ori-ori/parser";

// ── stack → upstream init guide ──────────────────────────────────────

export type Stack = "typescript" | "typescript-tauri";

/**
 * stack ごとの upstream framework init。`init` は docs/start/<doc> に同じ文字列で
 * 載っていること (tests/bootstrap.test.ts が一致を検証する)。
 */
export const STACK_GUIDES: Record<Stack, { doc: string; init: string[] }> = {
  typescript: {
    doc: "docs/start/typescript-web.md",
    init: ["pnpm create vite@latest . --template vanilla-ts"],
  },
  "typescript-tauri": {
    doc: "docs/start/tauri-v2.md",
    init: [
      "pnpm create vite@latest . --template vanilla-ts",
      "pnpm add -D @tauri-apps/cli",
      "pnpm tauri init",
    ],
  },
};

/**
 * scenario_test_runner.runner → root package.json に必要な devDependencies。
 * ori-architect SKILL.md の runtime_recipes.stacks[*].runner_deps と一致すること (test で検証)。
 */
export const RUNNER_DEPS: Record<string, string[]> = {
  playwright: ["@playwright/test"],
  wdio: [
    "@wdio/cli",
    "@wdio/local-runner",
    "webdriverio",
    "@wdio/tauri-service",
    "@wdio/mocha-framework",
    "@wdio/spec-reporter",
    "@wdio/globals",
    "@types/mocha",
    "@types/node",
  ],
  vitest: ["vitest"],
};

export interface AppTarget {
  name: string;
  path: string;
  runtime?: AppRuntime;
}

export function listApps(spec: ArchitectureSpec): AppTarget[] {
  if (spec.workspace) return spec.workspace.apps;
  const names = [...new Set(spec.roots.map((r) => r.app).filter((a): a is string => !!a))];
  return names.map((name) => ({ name, path: `apps/${name}` }));
}

function appRoots(spec: ArchitectureSpec, app: AppTarget) {
  return spec.roots.filter(
    (r) => r.app === app.name || r.path === app.path || r.path.startsWith(`${app.path}/`),
  );
}

/** decision_points の結果 (roots の language 構成) から stack を確定する。未対応なら null。 */
export function resolveStack(spec: ArchitectureSpec, app: AppTarget): Stack | null {
  const langs = new Set(appRoots(spec, app).map((r) => r.language));
  if (langs.has("typescript") && langs.has("rust")) return "typescript-tauri";
  if (langs.has("typescript")) return "typescript";
  return null;
}

/** TS 側 root の slice_root (= BC 名 kebab)。tauri specta scaffold の --bc-name に使う。 */
export function bcName(spec: ArchitectureSpec, app: AppTarget): string | undefined {
  return appRoots(spec, app).find((r) => r.language === "typescript")?.slice_root;
}

// ── checks ───────────────────────────────────────────────────────────

export type Level = "pass" | "fail" | "warn" | "skip";

export interface Check {
  id: string;
  app?: string;
  level: Level;
  message: string;
  fix?: string;
}

export interface VerifyOptions {
  projectRoot: string;
  spec: ArchitectureSpec;
  apps: AppTarget[];
  skipBuild: boolean;
  /** tauri specta scaffold script の path (fix 文言用) */
  scaffoldScript: string;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function depsOf(pkg: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  for (const key of ["dependencies", "devDependencies"]) {
    const block = pkg?.[key];
    if (block && typeof block === "object") Object.keys(block).forEach((d) => out.add(d));
  }
  return out;
}

function hasBuildScript(pkg: Record<string, unknown> | null): boolean {
  const scripts = pkg?.scripts as Record<string, unknown> | undefined;
  return typeof scripts?.build === "string";
}

export function initCommands(stack: Stack, app: AppTarget): string {
  // subshell で包み、実行後も project root に留まらせる
  const steps = [`mkdir -p ${app.path}`, `cd ${app.path}`, ...STACK_GUIDES[stack].init, "pnpm install"];
  return `(${steps.join(" && ")})`;
}

function checkRunnerDeps(root: string, spec: ArchitectureSpec): Check[] {
  const runner = spec.scenario_test_runner?.runner;
  if (!runner) return [];
  const required = RUNNER_DEPS[runner];
  if (!required) {
    return [{ id: "runner.deps", level: "warn", message: `未知の runner "${runner}" — runner deps は手動で確認` }];
  }
  const pkg = readJson(join(root, "package.json"));
  const add = `pnpm add -D ${required.join(" ")}`;
  if (!pkg) {
    return [{ id: "runner.deps", level: "fail", message: "root package.json が無い", fix: `pnpm init && ${add}` }];
  }
  const have = depsOf(pkg);
  const missing = required.filter((d) => !have.has(d));
  if (missing.length > 0) {
    return [{
      id: "runner.deps",
      level: "fail",
      message: `root package.json に ${runner} の runner deps が不足: ${missing.join(", ")}`,
      fix: `pnpm add -D ${missing.join(" ")}`,
    }];
  }
  return [{ id: "runner.deps", level: "pass", message: `${runner} runner deps 揃い済み` }];
}

/** G2: build-then-test の binary 契約。 */
function checkLocalRuntime(app: AppTarget, runtime: Extract<AppRuntime, { mode: "local" }>): Check {
  const id = "runtime.build-contract";
  if (!runtime.build) {
    return {
      id, app: app.name, level: "fail",
      message: "runtime.build が未宣言 (runtime.binary を生成する build command が必要 — G2)",
      fix: "/ori-architect で runtime block を再生成 (typescript-tauri recipe: pnpm tauri build --debug --no-bundle)",
    };
  }
  if (/\bcargo build\b/.test(runtime.build) && !/\btauri build\b/.test(runtime.build)) {
    return {
      id, app: app.name, level: "fail",
      message: `runtime.build "${runtime.build}" は devUrl 参照の dev binary を生成する (G2)`,
      fix: "runtime.build を `pnpm tauri build --debug --no-bundle` に変更",
    };
  }
  const profile = /--debug\b/.test(runtime.build) ? "debug" : "release";
  if (/\btauri build\b/.test(runtime.build) && !runtime.binary.includes(`/target/${profile}/`)) {
    return {
      id, app: app.name, level: "fail",
      message: `runtime.binary "${runtime.binary}" が build profile (${profile}) の出力先と一致しない (G2)`,
      fix: `runtime.binary を ${app.path}/src-tauri/target/${profile}/<binary> に揃える`,
    };
  }
  return { id, app: app.name, level: "pass", message: `runtime.build → ${runtime.binary}` };
}

/** G1: tauri-plugin-wdio 配線。/ori-generate が scenario 生成時に冪等 patch するため warn 止まり。 */
function checkWdioPlugin(root: string, app: AppTarget): Check {
  const tauriDir = join(root, app.path, "src-tauri");
  const cargo = /tauri-plugin-wdio/.test(readText(join(tauriDir, "Cargo.toml")));
  const libRs = /tauri_plugin_wdio::init\(\)/.test(readText(join(tauriDir, "src", "lib.rs")));
  let capability = false;
  const capDir = join(tauriDir, "capabilities");
  if (existsSync(capDir)) {
    capability = readdirSync(capDir)
      .filter((f) => f.endsWith(".json"))
      .some((f) => readText(join(capDir, f)).includes("wdio:default"));
  }
  const missing = [
    !cargo && "Cargo dep",
    !capability && "capabilities wdio:default",
    !libRs && "lib.rs 登録",
  ].filter(Boolean);
  if (missing.length === 0) {
    return { id: "tauri.wdio-plugin", app: app.name, level: "pass", message: "tauri-plugin-wdio 配線済み (G1)" };
  }
  return {
    id: "tauri.wdio-plugin", app: app.name, level: "warn",
    message: `tauri-plugin-wdio 未配線: ${missing.join(" / ")} (G1)`,
    fix: "/ori-generate が scenario 生成時に冪等 patch する (ここでは対応不要)",
  };
}

function staticChecks(opts: VerifyOptions, app: AppTarget, stack: Stack | null): Check[] {
  const root = opts.projectRoot;
  const appDir = join(root, app.path);
  const checks: Check[] = [];

  if (!stack) {
    checks.push({
      id: "app.stack", app: app.name, level: "fail",
      message: "roots の language 構成から stack を確定できない (対応: typescript / typescript+rust)",
      fix: "docs/start/index.md のサポート状況を確認し /ori-architect で roots を見直す",
    });
    return checks;
  }
  checks.push({ id: "app.stack", app: app.name, level: "pass", message: `stack=${stack} (${STACK_GUIDES[stack].doc})` });

  const pkg = readJson(join(appDir, "package.json"));
  if (!pkg) {
    checks.push({
      id: "app.package-json", app: app.name, level: "fail",
      message: `${app.path}/package.json が無い (upstream framework init 未実行)`,
      fix: initCommands(stack, app),
    });
    return checks;
  }
  checks.push({ id: "app.package-json", app: app.name, level: "pass", message: `${app.path}/package.json` });

  if (!app.runtime?.build) {
    checks.push(hasBuildScript(pkg)
      ? { id: "app.build-script", app: app.name, level: "pass", message: "package.json scripts.build" }
      : {
          id: "app.build-script", app: app.name, level: "fail",
          message: "package.json に scripts.build が無く runtime.build も未宣言 (build verify 不能)",
          fix: `${app.path}/package.json に build script を追加`,
        });
  }

  checks.push(existsSync(join(appDir, "node_modules"))
    ? { id: "app.node-modules", app: app.name, level: "pass", message: `${app.path}/node_modules` }
    : {
        id: "app.node-modules", app: app.name, level: "fail",
        message: `${app.path}/node_modules が無い (依存未インストール)`,
        fix: `(cd ${app.path} && pnpm install)`,
      });

  if (stack === "typescript-tauri") {
    const tauriDir = join(appDir, "src-tauri");
    const tauriReady = existsSync(join(tauriDir, "Cargo.toml")) && existsSync(join(tauriDir, "tauri.conf.json"));
    checks.push(tauriReady
      ? { id: "tauri.init", app: app.name, level: "pass", message: `${app.path}/src-tauri` }
      : {
          id: "tauri.init", app: app.name, level: "fail",
          message: `${app.path}/src-tauri (Cargo.toml / tauri.conf.json) が無い (pnpm tauri init 未実行)`,
          fix: `(cd ${app.path} && pnpm add -D @tauri-apps/cli && pnpm tauri init)`,
        });

    const scaffolded = existsSync(join(tauriDir, "src", "bin", "export-types.rs"))
      && existsSync(join(root, "apm-scripts", "specta-build.sh"));
    checks.push(scaffolded
      ? { id: "tauri.specta-scaffold", app: app.name, level: "pass", message: "specta scaffold 適用済み" }
      : {
          id: "tauri.specta-scaffold", app: app.name, level: "fail",
          message: "tauri specta scaffold 未適用 (export-types.rs / apm-scripts/specta-build.sh)",
          fix: `bash ${opts.scaffoldScript} --dest . --app-name ${app.name} --bc-name ${bcName(opts.spec, app) ?? "<bc-kebab>"}`,
        });

    if (opts.spec.scenario_test_runner?.runner === "wdio" && tauriReady) {
      checks.push(checkWdioPlugin(root, app));
    }
  }

  if (app.runtime?.mode === "local") checks.push(checkLocalRuntime(app, app.runtime));
  if (opts.spec.scenario_test_runner && !app.runtime) {
    checks.push({
      id: "runtime.block", app: app.name, level: "warn",
      message: "workspace.apps[].runtime が未宣言 (scenario に参加させるなら必要)",
      fix: "/ori-architect で runtime recipes に沿って runtime block を生成",
    });
  }
  return checks;
}

function buildCheck(opts: VerifyOptions, app: AppTarget): Check {
  const appDir = join(opts.projectRoot, app.path);
  const cmd = app.runtime?.build ?? "pnpm build";
  // stdout は --json 出力を汚さないよう stderr へ流す
  const r = spawnSync(cmd, { cwd: appDir, shell: true, stdio: ["ignore", 2, 2] });
  if (r.status !== 0) {
    return {
      id: "build", app: app.name, level: "fail",
      message: `\`${cmd}\` が失敗 (exit ${r.status ?? r.signal})`,
      fix: "上の build ログを確認して修正",
    };
  }
  if (app.runtime?.mode === "local") {
    const bin = join(opts.projectRoot, app.runtime.binary);
    if (!existsSync(bin) || !statSync(bin).isFile()) {
      return {
        id: "build", app: app.name, level: "fail",
        message: `\`${cmd}\` は成功したが runtime.binary ${app.runtime.binary} が無い (G2: build と binary の不一致)`,
        fix: "runtime.build の出力先と runtime.binary を揃える",
      };
    }
    return { id: "build", app: app.name, level: "pass", message: `\`${cmd}\` → ${app.runtime.binary}` };
  }
  return { id: "build", app: app.name, level: "pass", message: `\`${cmd}\`` };
}

export function verify(opts: VerifyOptions): Check[] {
  const checks: Check[] = [];
  const perApp = opts.apps.map((app) => {
    const own = staticChecks(opts, app, resolveStack(opts.spec, app));
    checks.push(...own);
    return { app, ok: !own.some((c) => c.level === "fail") };
  });
  checks.push(...checkRunnerDeps(opts.projectRoot, opts.spec));

  const scenariosDir = join(opts.projectRoot, ".ori", "scenarios");
  if (opts.spec.scenario_test_runner?.runner === "wdio" && existsSync(scenariosDir)) {
    const link = join(scenariosDir, "node_modules");
    const linked = existsSync(link) && lstatSync(link).isSymbolicLink();
    checks.push(linked
      ? { id: "scenarios.node-modules", level: "pass", message: ".ori/scenarios/node_modules symlink (G3)" }
      : {
          id: "scenarios.node-modules", level: "warn",
          message: ".ori/scenarios/node_modules symlink 未作成 (G3)",
          fix: "/ori-generate が scenario 生成時に作成する (ここでは対応不要)",
        });
  }

  for (const { app, ok } of perApp) {
    if (opts.skipBuild) {
      checks.push({ id: "build", app: app.name, level: "skip", message: "--skip-build 指定" });
    } else if (!ok) {
      checks.push({ id: "build", app: app.name, level: "skip", message: "静的チェック FAIL のため未実行" });
    } else {
      checks.push(buildCheck(opts, app));
    }
  }
  return checks;
}

export function overall(checks: Check[]): "PASS" | "FAIL" {
  return checks.some((c) => c.level === "fail") ? "FAIL" : "PASS";
}
