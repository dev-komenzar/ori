import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-doctor", "scripts", "check-hash-consistency.sh");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const DOMAIN = "# Aggregates\n";
const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const OK = h(DOMAIN);

function spec(coherence: string): string {
  return `---\nori:\n  schema:\n    propagation_level: file\ncoherence:\n${coherence}---\n\n# Spec\n`;
}
const MANIFEST = "type: slice\nderives_from:\n  - domain/aggregates.md#a\n  - domain/aggregates.md#b\n";

async function run(files: Record<string, string>, args: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), "ori-doctor-hash-"));
  tmpDirs.push(root);
  await mkdir(join(root, ".ori"), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
  const r = spawnSync("bash", [SCRIPT, ...args], { cwd: root, encoding: "utf8" });
  return { out: r.stdout + r.stderr, code: r.status };
}

const base = (coh: string, extra: Record<string, string> = {}) => ({
  ".ori/domain/aggregates.md": DOMAIN,
  ".ori/slices/s1/manifest.yaml": MANIFEST,
  ".ori/slices/s1/spec.md": spec(coh),
  ...extra,
});

describe("check-hash-consistency.sh", () => {
  it("記録 hash が現在値と一致すれば 0 issue", async () => {
    const r = await run(base(`  source: derived\n  upstream:\n    - domain/aggregates.md#a\n    - domain/aggregates.md#b\n  hash:\n    domain/aggregates.md: ${OK}\n`));
    expect(r.out).toContain("0 issue(s)");
    expect(r.code).toBe(0);
  });

  it("upstream: が無い spec でも drift を報告する", async () => {
    const r = await run(base(`  source: derived\n  hash:\n    domain/aggregates.md: 000000000000\n`));
    expect(r.out).toContain("drift: domain/aggregates.md");
    expect(r.out).toContain(OK);
    expect(r.code).toBe(1);
  });

  it("page / scenario も対象にする", async () => {
    const r = await run({
      ".ori/domain/aggregates.md": DOMAIN,
      ".ori/pages/p1/manifest.yaml": MANIFEST,
      ".ori/pages/p1/spec.md": spec(`  source: derived\n  hash:\n    domain/aggregates.md: 000000000000\n`),
      ".ori/scenarios/sc1/manifest.yaml": MANIFEST,
      ".ori/scenarios/sc1/spec.md": spec(`  source: derived\n  hash:\n    domain/aggregates.md: ${OK}\n`),
    });
    expect(r.out).toContain("pages/p1");
    expect(r.out).not.toContain("scenarios/sc1:");
    expect(r.code).toBe(1);
  });

  it("記録された file が存在しなければ報告する", async () => {
    const r = await run(base(`  source: derived\n  hash:\n    domain/aggregates.md: ${OK}\n    domain/gone.md: ${OK}\n`));
    expect(r.out).toContain("記録された file が存在しません: domain/gone.md");
    expect(r.out).toContain("hash 余剰: domain/gone.md");
    expect(r.code).toBe(2);
  });

  it("derives_from にあるが hash に無い file を欠落として報告する", async () => {
    const r = await run(
      base(`  source: derived\n  hash:\n    domain/aggregates.md: ${OK}\n`, {
        ".ori/slices/s1/manifest.yaml": MANIFEST + "  - domain/other.md#x\n",
        ".ori/domain/other.md": "x\n",
      }),
    );
    expect(r.out).toContain("hash 欠落: domain/other.md");
    expect(r.code).toBe(1);
  });

  it("source: derived なのに hash 未記録なら報告する", async () => {
    const r = await run(base(`  source: derived\n  upstream: []\n  hash: {}\n`));
    expect(r.out).toContain("coherence.source: derived なのに coherence.hash が未記録");
    expect(r.code).toBe(1);
  });

  it("stub (derives_from 空・hash 空) は issue にしない", async () => {
    const r = await run({
      ".ori/slices/s1/manifest.yaml": "type: slice\nderives_from: []\n",
      ".ori/slices/s1/spec.md": spec(`  source: derived\n  upstream: []\n  hash: {}\n`),
    });
    expect(r.code).toBe(0);
  });

  it("旧形式キー (#.* / #anchor) は正規化して比較し偽陽性 drift を出さず INFO で --migrate を案内する", async () => {
    const r = await run(base(`  source: derived\n  hash:\n    domain/aggregates.md#.*: ${OK}\n    domain/aggregates.md#b: ${OK}\n`));
    expect(r.out).not.toContain("drift");
    expect(r.out).toContain("INFO");
    expect(r.out).toContain("--migrate");
    expect(r.code).toBe(0);
  });

  it("単一ターゲット <kind>/<id> だけを検査する", async () => {
    const files = {
      ...base(`  source: derived\n  hash:\n    domain/aggregates.md: ${OK}\n`),
      ".ori/slices/s2/manifest.yaml": MANIFEST,
      ".ori/slices/s2/spec.md": spec(`  source: derived\n  hash:\n    domain/aggregates.md: 000000000000\n`),
    };
    expect((await run(files, ["slices/s1"])).code).toBe(0);
    const r2 = await run(files, ["slices/s2"]);
    expect(r2.code).toBe(1);
    expect(r2.out).toContain("slices/s2");
  });

  it("存在しないターゲットは exit 2", async () => {
    const r = await run(base(`  source: derived\n`), ["slices/nope"]);
    expect(r.code).toBe(64);
    expect(r.out).toContain("対象が見つかりません");
  });

  it("不明 option も exit 64 (issue 件数と区別できる)", async () => {
    const r = await run(base(`  source: derived\n`), ["--bogus"]);
    expect(r.code).toBe(64);
  });

  it("issue 件数 2 は exit 2 のまま (引数誤りと区別できる)", async () => {
    const r = await run(base(`  source: derived\n  hash:\n    domain/aggregates.md: ${OK}\n    domain/gone.md: ${OK}\n`));
    expect(r.code).toBe(2);
  });
});
