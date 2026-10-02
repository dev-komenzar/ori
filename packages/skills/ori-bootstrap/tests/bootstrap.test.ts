import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";
import { RUNNER_DEPS, STACK_GUIDES } from "../src/internal/readiness.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(REPO_ROOT, ".apm", "skills", "ori-bootstrap", "scripts", "bootstrap.js");
const FIXTURES = join(REPO_ROOT, "packages", "skills", "ori-arch", "tests", "fixtures", "agent-generated");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(args: string[], cwd: string): Promise<RunResult> {
  try {
    const r = await execFileAsync("node", [SCRIPT, ...args], { cwd });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

interface JsonCheck {
  id: string;
  app?: string;
  level: string;
  message: string;
  fix?: string;
}

async function verifyJson(cwd: string, extra: string[] = []) {
  const r = await run(["verify", "--json", ...extra], cwd);
  return { code: r.code, out: JSON.parse(r.stdout) as { result: string; checks: JsonCheck[] } };
}

const level = (checks: JsonCheck[], id: string) => checks.find((c) => c.id === id)?.level;

async function withProject(
  files: Record<string, string>,
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ori-bootstrap-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body, "utf8");
    }
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function fixtureSpec(stack: "typescript" | "typescript-tauri", build?: string): Promise<string> {
  const raw = await readFile(join(FIXTURES, stack, "architecture.md"), "utf8");
  return build ? raw.replace(/build: pnpm tauri build --debug --no-bundle/, `build: ${build}`) : raw;
}

const WDIO_ROOT_PKG = JSON.stringify({ name: "root", devDependencies: Object.fromEntries(RUNNER_DEPS.wdio!.map((d) => [d, "*"])) });

/** upstream init + scaffold 済みの typescript-tauri project (build は node で binary を作る fake) */
async function tauriReadyFiles(build: string): Promise<Record<string, string>> {
  return {
    ".ori/architecture.md": await fixtureSpec("typescript-tauri", build),
    "package.json": WDIO_ROOT_PKG,
    "apps/myapp/package.json": JSON.stringify({ name: "myapp", scripts: { build: "vite build" } }),
    "apps/myapp/node_modules/.keep": "",
    "apps/myapp/src-tauri/Cargo.toml": "[package]\nname = \"myapp\"\n",
    "apps/myapp/src-tauri/tauri.conf.json": "{}",
    "apps/myapp/src-tauri/src/lib.rs": "pub fn run() {}\n",
    "apps/myapp/src-tauri/src/bin/export-types.rs": "fn main() {}\n",
    "apm-scripts/specta-build.sh": "#!/bin/sh\n",
  };
}

const MAKE_BIN = `node -e "require('fs').mkdirSync('src-tauri/target/debug',{recursive:true});require('fs').writeFileSync('src-tauri/target/debug/myapp','')"`;

// ── SSoT 整合 ────────────────────────────────────────────────────────

describe("SSoT consistency", () => {
  it("RUNNER_DEPS matches ori-architect runtime_recipes runner_deps", async () => {
    const md = await readFile(join(REPO_ROOT, ".apm", "skills", "ori-architect", "SKILL.md"), "utf8");
    const block = md.match(/```yaml\n(runtime_recipes:[\s\S]*?)```/)?.[1];
    expect(block).toBeDefined();
    const recipes = yamlParse(block!).runtime_recipes.stacks as Record<
      string,
      { scenario_test_runner: string; runner_deps: string[] }
    >;
    for (const recipe of Object.values(recipes)) {
      expect(RUNNER_DEPS[recipe.scenario_test_runner]).toEqual(recipe.runner_deps);
    }
  });

  it.each(Object.entries(STACK_GUIDES))("%s guide commands appear in its docs/start page", async (_stack, g) => {
    const doc = await readFile(join(REPO_ROOT, g.doc), "utf8");
    for (const cmd of g.init) expect(doc).toContain(cmd);
  });
});

// ── guide ────────────────────────────────────────────────────────────

describe("guide", () => {
  it("resolves typescript-tauri and lists init / scaffold / runner deps", async () => {
    await withProject({ ".ori/architecture.md": await fixtureSpec("typescript-tauri") }, async (root) => {
      const r = await run(["guide", "--json"], root);
      expect(r.code).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.apps[0].stack).toBe("typescript-tauri");
      expect(out.apps[0].doc).toBe("docs/start/tauri-v2.md");
      expect(out.apps[0].upstream_init).toContain("pnpm tauri init");
      expect(out.apps[0].tauri_scaffold).toContain("--app-name myapp --bc-name task-management");
      expect(out.runner_deps).toContain("@wdio/tauri-service");
    });
  });

  it("resolves typescript (web) without tauri scaffold", async () => {
    await withProject({ ".ori/architecture.md": await fixtureSpec("typescript") }, async (root) => {
      const out = JSON.parse((await run(["guide", "--json"], root)).stdout);
      expect(out.apps[0].stack).toBe("typescript");
      expect(out.apps[0].tauri_scaffold).toBeNull();
      expect(out.runner_deps).toBe("pnpm add -D @playwright/test");
    });
  });
});

// ── verify ───────────────────────────────────────────────────────────

describe("verify", () => {
  it("FAILs without architecture.md and points to /ori-architect", async () => {
    await withProject({}, async (root) => {
      const { code, out } = await verifyJson(root);
      expect(code).toBe(1);
      expect(out.checks[0]!.id).toBe("spec.architecture-md");
      expect(out.checks[0]!.fix).toContain("/ori-architect");
    });
  });

  it("FAILs an uninitialized app with the upstream init command as fix, and skips build", async () => {
    await withProject({ ".ori/architecture.md": await fixtureSpec("typescript-tauri") }, async (root) => {
      const { code, out } = await verifyJson(root);
      expect(code).toBe(1);
      expect(out.result).toBe("FAIL");
      const pkg = out.checks.find((c) => c.id === "app.package-json")!;
      expect(pkg.level).toBe("fail");
      for (const cmd of STACK_GUIDES["typescript-tauri"].init) expect(pkg.fix).toContain(cmd);
      expect(level(out.checks, "build")).toBe("skip");
    });
  });

  it("PASSes a ready tauri app when build produces runtime.binary (G1 unwired is warn only)", async () => {
    await withProject(await tauriReadyFiles(MAKE_BIN), async (root) => {
      const { code, out } = await verifyJson(root);
      expect(out.checks.filter((c) => c.level === "fail")).toEqual([]);
      expect(code).toBe(0);
      expect(level(out.checks, "build")).toBe("pass");
      expect(level(out.checks, "tauri.wdio-plugin")).toBe("warn");
    });
  });

  it("reports missing specta scaffold and runner deps with fixes", async () => {
    const files = await tauriReadyFiles(MAKE_BIN);
    delete files["apps/myapp/src-tauri/src/bin/export-types.rs"];
    files["package.json"] = JSON.stringify({ name: "root", devDependencies: { "@wdio/cli": "*" } });
    await withProject(files, async (root) => {
      const { out } = await verifyJson(root);
      const scaffold = out.checks.find((c) => c.id === "tauri.specta-scaffold")!;
      expect(scaffold.level).toBe("fail");
      expect(scaffold.fix).toContain("install-tauri-scaffold.sh --dest . --app-name myapp --bc-name task-management");
      const deps = out.checks.find((c) => c.id === "runner.deps")!;
      expect(deps.level).toBe("fail");
      expect(deps.fix).toContain("@wdio/tauri-service");
      expect(deps.fix).not.toContain("@wdio/cli");
    });
  });

  it("FAILs when build succeeds but runtime.binary is absent (G2)", async () => {
    await withProject(await tauriReadyFiles(`node -e "0"`), async (root) => {
      const { code, out } = await verifyJson(root);
      expect(code).toBe(1);
      const build = out.checks.find((c) => c.id === "build")!;
      expect(build.level).toBe("fail");
      expect(build.message).toContain("G2");
    });
  });

  it("FAILs when the build command fails", async () => {
    await withProject(await tauriReadyFiles(`node -e "process.exit(3)"`), async (root) => {
      const { code, out } = await verifyJson(root);
      expect(code).toBe(1);
      expect(out.checks.find((c) => c.id === "build")!.message).toContain("exit 3");
    });
  });

  it("FAILs a cargo-build runtime statically (dev binary, G2)", async () => {
    await withProject(await tauriReadyFiles("cargo build"), async (root) => {
      const { out } = await verifyJson(root);
      expect(level(out.checks, "runtime.build-contract")).toBe("fail");
      expect(level(out.checks, "build")).toBe("skip");
    });
  });

  it("--skip-build verifies statically only", async () => {
    await withProject(await tauriReadyFiles(`node -e "process.exit(3)"`), async (root) => {
      const { code, out } = await verifyJson(root, ["--skip-build"]);
      expect(code).toBe(0);
      expect(level(out.checks, "build")).toBe("skip");
    });
  });

  it("PASSes a typescript (web) app via package.json build script", async () => {
    await withProject(
      {
        ".ori/architecture.md": await fixtureSpec("typescript"),
        "package.json": JSON.stringify({ name: "root", devDependencies: { "@playwright/test": "*" } }),
        "apps/myapp/package.json": JSON.stringify({ name: "myapp", scripts: { build: `node -e "0"` } }),
        "apps/myapp/node_modules/.keep": "",
      },
      async (root) => {
        const { code, out } = await verifyJson(root);
        expect(out.checks.filter((c) => c.level === "fail")).toEqual([]);
        expect(code).toBe(0);
        expect(level(out.checks, "build")).toBe("pass");
      },
    );
  });

  it("checks .ori/scenarios/node_modules symlink when scenarios exist (G3)", async () => {
    const files = await tauriReadyFiles(MAKE_BIN);
    files[".ori/scenarios/.keep"] = "";
    await withProject(files, async (root) => {
      expect(level((await verifyJson(root, ["--skip-build"])).out.checks, "scenarios.node-modules")).toBe("warn");
      await symlink("../../apps/myapp/node_modules", join(root, ".ori/scenarios/node_modules"));
      expect(level((await verifyJson(root, ["--skip-build"])).out.checks, "scenarios.node-modules")).toBe("pass");
    });
  });
});
