import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(
  __dirname, "..", "..", "..", "..",
  ".apm", "skills", "ori-doctor", "scripts", "check-scenario-schema.sh",
);

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function statusYaml(completion: string[], phases: Record<string, string>): string {
  const comp = completion.length ? "\n" + completion.map((p) => `    - ${p}`).join("\n") : " []";
  const ph = Object.keys(phases).length
    ? "\n" + Object.entries(phases).map(([k, v]) => `  ${k}:\n    state: ${v}`).join("\n")
    : " {}";
  return `scenario_id: x\nbeads:\n  epic: e\n  current_phase: null\n  completion:${comp}\nphases:${ph}\ndirty: []\n`;
}

interface Fixture {
  status?: string;
  tests?: boolean;
  review?: string;
}

async function run(scenarios: Record<string, Fixture>, cwdSub = "") {
  const root = await mkdtemp(join(tmpdir(), "ori-scn-schema-"));
  tmpDirs.push(root);
  for (const [id, f] of Object.entries(scenarios)) {
    const dir = join(root, ".ori", "scenarios", id);
    await mkdir(join(dir, "tests"), { recursive: true });
    if (f.status !== undefined) await writeFile(join(dir, "status.yaml"), f.status);
    if (f.tests) await writeFile(join(dir, "tests", "a.test.ts"), "");
    if (f.review !== undefined) await writeFile(join(dir, "review.md"), f.review);
  }
  const cwd = join(root, cwdSub);
  await mkdir(cwd, { recursive: true });
  const r = spawnSync("bash", [SCRIPT], { cwd, encoding: "utf8" });
  return { out: r.stdout + r.stderr, code: r.status };
}

const ALL = ["derive", "generate", "review", "finalize"];
const allDone = Object.fromEntries(ALL.map((p) => [p, "done"]));

describe("check-scenario-schema.sh", () => {
  it("clean: 全 phase done + 成果物あり", async () => {
    const r = await run({ ok: { status: statusYaml(ALL, allDone), tests: true, review: "verdict: PASS\n" } });
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 issue(s)");
  });

  it("s1/s4 型: phases 空 + tests/ + review.md を検出", async () => {
    const r = await run({ s1: { status: statusYaml([], {}), tests: true, review: "verdict: NEEDS_FIX\n" } });
    expect(r.code).toBe(2);
    expect(r.out).toContain("tests/ が存在するが phases.generate");
    expect(r.out).toContain("review.md が存在するが phases.review");
  });

  it("completion と phases の不整合を検出", async () => {
    const r = await run({ s3: { status: statusYaml(["finalize"], {}) } });
    expect(r.code).toBe(1);
    expect(r.out).toContain("beads.completion に finalize がある");
  });

  it("s2 型: review PASS 済みだが finalize 未記録を検出 (進行中なら無視可)", async () => {
    const done3 = { derive: "done", generate: "done", review: "done" };
    const r = await run({
      s2: { status: statusYaml(["derive", "generate", "review"], done3), tests: true, review: "verdict: PASS\n" },
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("finalize");
    expect(r.out).toContain("進行中の scenario なら無視可");
  });

  it("s2 型: verdict 行の無い review.md でも review=done + finalize 未記録を検出", async () => {
    const done3 = { derive: "done", generate: "done", review: "done" };
    const r = await run({
      s2b: { status: statusYaml(["derive", "generate", "review"], done3), tests: true, review: "# Review\n\n**Verdict**: 良好\n" },
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("phases.finalize=(未記録)");
  });

  it("status.yaml 不在を WARN", async () => {
    const r = await run({ legacy: {} });
    expect(r.code).toBe(1);
    expect(r.out).toContain("no status.yaml");
  });

  it("subdir から実行しても project root を検出する (cd PROJECT_ROOT)", async () => {
    const r = await run({ s1: { status: statusYaml([], {}), tests: true } }, "sub/dir");
    expect(r.code).toBe(1);
    expect(r.out).not.toContain("no .ori/scenarios/");
  });

  it("legacy scalar vocab を『未記録』と誤報しない", async () => {
    const legacy = "scenario_id: x\nbeads:\n  epic: e\n  current_phase: null\n  completion: []\nphases:\n  generate: completed\ndirty: []\n";
    const r = await run({ s5: { status: legacy, tests: true } });
    expect(r.out).toContain("legacy 形式");
    expect(r.out).not.toContain("phases.generate=(未記録)");
  });
});
