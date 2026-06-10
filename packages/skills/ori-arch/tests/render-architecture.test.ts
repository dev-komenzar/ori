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
  it("renders ddd-vsa-hex / typescript to a parsable ArchitectureSpec", async () => {
    const dir = await setupTmp("myapp");
    const r = await runScript(["--pattern", "ddd-vsa-hex", "--stack", "typescript"], dir);
    expect(r.code, `stderr:\n${r.stderr}`).toBe(0);
    const out = await readFile(join(dir, ".ori/architecture.md"), "utf8");
    expect(out, "no unresolved placeholders").not.toMatch(/\{\{[A-Z_]+\}\}/);
    const spec = parseArchitectureSpec(out);
    expect(spec.roots).toHaveLength(1);
    expect(spec.roots[0]!.app).toBe("myapp");
    expect(spec.roots[0]!.path).toBe("apps/myapp/src");
    expect(spec.roots[0]!.slice_root).toBe("task-management");
  });

  it("renders ddd-vsa-hex / typescript-tauri with both roots and BC_NAME_RS auto-derived from --bc", async () => {
    const dir = await setupTmp("mytauri");
    const r = await runScript(
      ["--pattern", "ddd-vsa-hex", "--stack", "typescript-tauri", "--bc", "user-account"],
      dir,
    );
    expect(r.code, `stderr:\n${r.stderr}`).toBe(0);
    const out = await readFile(join(dir, ".ori/architecture.md"), "utf8");
    expect(out).not.toMatch(/\{\{[A-Z_]+\}\}/);
    const spec = parseArchitectureSpec(out);
    expect(spec.roots).toHaveLength(2);
    expect(spec.roots.find((r) => r.id === "ts")!.slice_root).toBe("user-account");
    expect(spec.roots.find((r) => r.id === "rs")!.slice_root).toBe("user_account");
  });

  it("is idempotent — default skip when target exists, --force overwrites with new placeholders", async () => {
    const dir = await setupTmp("myapp");
    const r0 = await runScript(["--pattern", "ddd-vsa-hex", "--stack", "typescript"], dir);
    expect(r0.code, r0.stderr).toBe(0);
    const first = await readFile(join(dir, ".ori/architecture.md"), "utf8");

    const r1 = await runScript(
      ["--pattern", "ddd-vsa-hex", "--stack", "typescript", "--bc", "renamed"],
      dir,
    );
    expect(r1.code, r1.stderr).toBe(0);
    expect(await readFile(join(dir, ".ori/architecture.md"), "utf8")).toBe(first);

    const r2 = await runScript(
      ["--pattern", "ddd-vsa-hex", "--stack", "typescript", "--bc", "renamed", "--force"],
      dir,
    );
    expect(r2.code, r2.stderr).toBe(0);
    const overwritten = await readFile(join(dir, ".ori/architecture.md"), "utf8");
    expect(overwritten).toContain("renamed");
    expect(overwritten).not.toContain("task-management");
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
    const r = await runScript(["--pattern", "ddd-vsa-hex", "--stack", "typescript"], dir);
    expect(r.code).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/config\.yaml/);
  });

  it("accepts --app to override config.yaml and --bc-rs to override auto-derivation", async () => {
    const dir = await setupTmp("ignored");
    const r = await runScript(
      [
        "--pattern", "ddd-vsa-hex",
        "--stack", "typescript-tauri",
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
    const spec = parseArchitectureSpec(out);
    expect(spec.roots.find((r) => r.id === "ts")!.slice_root).toBe("billing");
    expect(spec.roots.find((r) => r.id === "rs")!.slice_root).toBe("billing_module");
  });
});
