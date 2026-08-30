import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/skills/ori-arch/tests/ -> repo root
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(REPO_ROOT, ".apm/skills/ori-arch/scripts/render-architecture.js");
// テスト専用の最小 pattern bundle (ori-c79.6: tpl 機構の回帰検証用)
const PATTERNS_FIXTURE = join(__dirname, "fixtures", "patterns-dir");

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], cwd: string): Promise<Run> {
  return new Promise((res, rej) => {
    // bundle-adjacent resolver: SCRIPT lives next to .apm/skills/ori-arch/patterns/,
    // so no --patterns-dir or env var is needed (Phase K2, S3).
    const p = spawn("node", [SCRIPT, ...args], {
      cwd,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => { stdout += d.toString(); });
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("error", rej);
    p.on("close", (code) => res({ code: code ?? 1, stdout, stderr }));
  });
}

function buildSkills(): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn("pnpm", ["build:skills"], { cwd: REPO_ROOT, stdio: "inherit" });
    p.on("error", rej);
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`build:skills exited ${code ?? "?"}`))));
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function setupTmp(appName: string | null): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ori-arch-render-"));
  if (appName !== null) {
    await mkdir(join(dir, ".ori"), { recursive: true });
    await writeFile(
      join(dir, ".ori", "config.yaml"),
      `ori:\n  version: 1\n  workspace:\n    apps_root: apps\n    apps:\n      - name: ${appName}\n        path: apps/${appName}\n`,
      "utf8",
    );
  }
  return dir;
}

beforeAll(async () => {
  if (!(await exists(SCRIPT))) await buildSkills();
}, 60_000);

describe("render-architecture — end-to-end (ori-62h)", () => {
  it("exits 2 with ori-architect guidance when the stack tpl was removed (ori-c79.6)", async () => {
    const dir = await setupTmp("myapp");
    const r = await runScript(["--pattern", "ddd-vsa-hex", "--stack", "typescript"], dir);
    expect(r.code, `stderr:\n${r.stderr}`).toBe(2);
    const all = r.stderr + r.stdout;
    expect(all).toContain("ori-architect");
    expect(all).toContain("generation_procedure");
  });

  it("exits 2 with guidance for typescript-tauri as well", async () => {
    const dir = await setupTmp("mytauri");
    const r = await runScript(
      ["--pattern", "ddd-vsa-hex", "--stack", "typescript-tauri"],
      dir,
    );
    expect(r.code, `stderr:\n${r.stderr}`).toBe(2);
    const all = r.stderr + r.stdout;
    expect(all).toContain("ori-architect");
  });

  it("exits 2 on unknown pattern and lists available patterns", async () => {
    const dir = await setupTmp("myapp");
    const r = await runScript(["--pattern", "nonexistent", "--stack", "typescript"], dir);
    expect(r.code).toBe(2);
    const all = r.stderr + r.stdout;
    expect(all).toContain("nonexistent");
    expect(all).toContain("ddd-vsa-hex");
  });

  it("exits 2 on unknown stack and lists available stacks for the pattern", async () => {
    const dir = await setupTmp("myapp");
    const r = await runScript(["--pattern", "ddd-vsa-hex", "--stack", "nonexistent"], dir);
    expect(r.code).toBe(2);
    const all = r.stderr + r.stdout;
    expect(all).toContain("nonexistent");
    expect(all).toContain("typescript");
  });

  it("exits 2 when .ori/config.yaml is missing and --app is not given", async () => {
    const dir = await setupTmp(null);
    const r = await runScript(
      ["--pattern", "demo", "--stack", "web", "--patterns-dir", PATTERNS_FIXTURE],
      dir,
    );
    expect(r.code).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/config\.yaml/);
  });

  it("accepts --app to override config.yaml and --bc-rs to override auto-derivation", async () => {
    const dir = await setupTmp("ignored");
    const r = await runScript(
      [
        "--pattern", "demo",
        "--stack", "web",
        "--patterns-dir", PATTERNS_FIXTURE,
        "--app", "explicit-app",
        "--bc", "billing",
        "--bc-rs", "billing_module",
      ],
      dir,
    );
    expect(r.code, r.stderr).toBe(0);
    const out = await readFile(join(dir, ".ori/architecture.md"), "utf8");
    expect(out).toContain("apps/explicit-app/src");
    expect(out).not.toContain("ignored");
    expect(out).toContain("billing");
    expect(out).toContain("billing_module");
    const spec = parseArchitectureSpec(out);
    expect(spec.roots[0]!.slice_root).toBe("billing");
  });

  it("is idempotent — default skip when target exists, --force overwrites", async () => {
    const dir = await setupTmp("myapp");
    const opts = ["--pattern", "demo", "--stack", "web", "--patterns-dir", PATTERNS_FIXTURE];
    const r0 = await runScript([...opts, "--bc", "first"], dir);
    expect(r0.code, r0.stderr).toBe(0);
    const first = await readFile(join(dir, ".ori/architecture.md"), "utf8");
    expect(first).toContain("first");

    const r1 = await runScript([...opts, "--bc", "renamed"], dir);
    expect(r1.code, r1.stderr).toBe(0);
    expect(await readFile(join(dir, ".ori/architecture.md"), "utf8")).toBe(first);

    const r2 = await runScript([...opts, "--bc", "renamed", "--force"], dir);
    expect(r2.code, r2.stderr).toBe(0);
    const overwritten = await readFile(join(dir, ".ori/architecture.md"), "utf8");
    expect(overwritten).toContain("renamed");
    expect(overwritten).not.toContain("first");
  });
});
