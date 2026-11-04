import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// ori-oan.13.7: ui-fields にあるが持ち主 page の spec に挙動規定が無い field (doctor §15)
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-doctor", "scripts", "check-spec-gaps.sh");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function run(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "ori-spec-gaps-"));
  tmpDirs.push(root);
  await mkdir(join(root, ".ori"), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, ".ori", rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  const r = spawnSync("bash", [SCRIPT], { cwd: root, encoding: "utf8" });
  return { out: r.stdout + r.stderr, code: r.status };
}

const SCREEN = "# S {#screen-1}\n\n## Fields {#fields}\n\n| {#screen-1-reset} | 戻す |\n| {#screen-1-save} | 保存 |\n";
const MANIFEST = "page_id: settings\ntype: widget\nderives_from:\n  - domain/ui-fields/screen-1.md#screen-1\n";
const spec = (tp: string) =>
  `# settings {#settings}\n\n## レイアウト {#layout}\n\n[screen-1-reset]\n\n## 不変条件 {#invariants}\n\n- 無し\n\n## テスト観点 {#test-points}\n\n${tp}\n`;

describe("check-spec-gaps.sh", () => {
  it("規定の無い field を WARN し、件数を exit code で返す", async () => {
    const r = await run({
      "domain/ui-fields/screen-1.md": SCREEN,
      "pages/settings/manifest.yaml": MANIFEST,
      "pages/settings/spec.md": spec("- field `screen-1-save` で保存される"),
    });
    expect(r.out).toContain("WARN page/settings#screen-1-reset: 挙動規定なし");
    expect(r.out).toContain("fix: /ori-flow settings");
    expect(r.out).toContain("spec gaps: 1 issue(s)");
    expect(r.code).toBe(1);
  });

  it("全 field 規定済みなら exit 0", async () => {
    const r = await run({
      "domain/ui-fields/screen-1.md": SCREEN,
      "pages/settings/manifest.yaml": MANIFEST,
      "pages/settings/spec.md": spec("- field `screen-1-save` で保存される\n- field `screen-1-reset` で既定値に戻る"),
    });
    expect(r.out).toContain("spec gaps: 0 issue(s)");
    expect(r.code).toBe(0);
  });

  it(".ori/pages が無ければ skip で exit 0", async () => {
    const r = await run({ "domain/ui-fields/screen-1.md": SCREEN });
    expect(r.out).toContain("skipped");
    expect(r.code).toBe(0);
  });
  it("壊れた page は ERROR として数え、他 page の WARN も数える", async () => {
    const r = await run({
      "domain/ui-fields/screen-1.md": SCREEN,
      "pages/0bad/manifest.yaml": "type: [unclosed\n",
      "pages/settings/manifest.yaml": MANIFEST,
      "pages/settings/spec.md": spec("- field `screen-1-save` で保存される"),
    });
    expect(r.out).toMatch(/ERROR 0bad: /);
    expect(r.out).toContain("WARN page/settings#screen-1-reset: 挙動規定なし");
    expect(r.out).toContain("spec gaps: 2 issue(s)");
    expect(r.code).toBe(2);
  });
});
