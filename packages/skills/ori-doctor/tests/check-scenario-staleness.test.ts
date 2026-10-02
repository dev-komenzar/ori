import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(
  __dirname, "..", "..", "..", "..",
  ".apm", "skills", "ori-doctor", "scripts", "check-scenario-staleness.sh",
);

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

// file → mtime (epoch 秒)。review.md の基準は 1000
async function run(files: Record<string, number>) {
  const root = await mkdtemp(join(tmpdir(), "ori-scn-stale-"));
  tmpDirs.push(root);
  await mkdir(join(root, ".ori", "scenarios"), { recursive: true });
  for (const [rel, mtime] of Object.entries(files)) {
    const p = join(root, ".ori", "scenarios", rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, "");
    await utimes(p, mtime, mtime);
  }
  const r = spawnSync("bash", [SCRIPT], { cwd: root, encoding: "utf8" });
  return { out: r.stdout + r.stderr, code: r.status };
}

describe("check-scenario-staleness.sh", () => {
  it("clean: review.md が spec/tests より新しい", async () => {
    const r = await run({ "s1/review.md": 1000, "s1/spec.md": 900, "s1/tests/a.test.ts": 900 });
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 issue(s)");
  });

  it("同秒は stale にしない", async () => {
    const r = await run({ "s1/review.md": 1000, "s1/spec.md": 1000 });
    expect(r.code).toBe(0);
  });

  it("spec.md が review.md より新しい → WARN + /ori-flow 再走導線", async () => {
    const r = await run({ "s1/review.md": 1000, "s1/spec.md": 2000 });
    expect(r.code).toBe(1);
    expect(r.out).toContain("scenarios/s1: review.md が陳腐化");
    expect(r.out).toContain("spec.md");
    expect(r.out).toContain("/ori-flow s1");
  });

  it.each([
    "wdio.conf.ts", "playwright.config.ts", "teardown.mjs", "tsconfig.json",
    "docker-compose.yml", "manifest.yaml", "validation.md",
  ])("scenario 直下の %s が新しい → WARN", async (name) => {
    const r = await run({ "s2/review.md": 1000, [`s2/${name}`]: 3000 });
    expect(r.code).toBe(1);
    expect(r.out).toContain(name);
  });

  it("tests/ 配下が新しい → WARN", async () => {
    const r = await run({ "s2/review.md": 1000, "s2/tests/a.test.ts": 3000 });
    expect(r.code).toBe(1);
    expect(r.out).toContain("tests/a.test.ts");
  });

  it("status.yaml が新しくても stale にしない", async () => {
    const r = await run({ "s2/review.md": 1000, "s2/status.yaml": 3000 });
    expect(r.code).toBe(0);
  });

  it("4 件以上新しいと『他 N 件』表示", async () => {
    const r = await run({
      "s2/review.md": 1000, "s2/spec.md": 2000, "s2/wdio.conf.ts": 2000,
      "s2/tsconfig.json": 2000, "s2/teardown.mjs": 2000, "s2/manifest.yaml": 2000,
    });
    expect(r.out).toContain("他 2 件");
  });

  it("複数 scenario で exit code = stale scenario 数", async () => {
    const r = await run({
      "a/review.md": 1000, "a/spec.md": 2000,
      "b/review.md": 1000, "b/spec.md": 2000,
      "c/review.md": 1000, "c/spec.md": 500,
    });
    expect(r.code).toBe(2);
    expect(r.out).toContain("2 issue(s)");
  });

  it("review.md 無しは対象外", async () => {
    const r = await run({ "s3/spec.md": 2000 });
    expect(r.code).toBe(0);
  });
});
