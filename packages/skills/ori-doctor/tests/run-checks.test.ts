import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_CHECKS = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  ".apm",
  "skills",
  "ori-doctor",
  "scripts",
  "run-checks.sh",
);

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

// Build an isolated project: run-checks.sh copied next to fixture check-*.sh
// scripts so SCRIPT_DIR contains only what the test controls.
async function runWithChecks(checks: Record<string, number>) {
  const root = await mkdtemp(join(tmpdir(), "ori-doctor-rc-"));
  tmpDirs.push(root);
  await mkdir(join(root, ".ori"));
  const scripts = join(root, "scripts");
  await mkdir(scripts);
  await copyFile(RUN_CHECKS, join(scripts, "run-checks.sh"));
  for (const [name, code] of Object.entries(checks)) {
    const p = join(scripts, `check-${name}.sh`);
    await writeFile(p, `#!/usr/bin/env bash\necho "fixture ${name}"\nexit ${code}\n`);
    await chmod(p, 0o755);
  }
  return spawnSync("bash", [join(scripts, "run-checks.sh")], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("run-checks.sh aggregation", () => {
  it("exits 0 with Total 0 when all checks pass", async () => {
    const r = await runWithChecks({ a: 0, b: 0 });
    expect(r.stdout).toContain("=== Total issues: 0 ===");
    expect(r.status).toBe(0);
  });

  it("reflects a failing check in Total and exits 1", async () => {
    const r = await runWithChecks({ a: 0, b: 3 });
    expect(r.stdout).toContain("=== Total issues: 3 ===");
    expect(r.status).toBe(1);
  });

  it("sums failures across multiple checks", async () => {
    const r = await runWithChecks({ a: 2, b: 1 });
    expect(r.stdout).toContain("=== Total issues: 3 ===");
    expect(r.status).toBe(1);
  });
});
