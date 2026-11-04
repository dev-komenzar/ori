import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
// build-skills の出力 (skill に同梱される bundle) を実行する
const SYNC = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-sync", "scripts", "sync.js");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ori-sync-"));
  tmpDirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
  return root;
}

function run(root: string, args: string[]) {
  const r = spawnSync("node", [SYNC, ...args], { cwd: root, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

// 旧 clear-dirty.sh の sed が残した形 (GitHub #133)
const BROKEN = "slice_id: broken\ndirty: []\n  - source:\n      path: .ori/domain/x.md\nfinalized_at: 2026-06-30\n";
const MANIFEST = "derives_from:\n  - domain/x.md\n";

describe("sync.js with an invalid status.yaml (ori-6dr5)", () => {
  it("names the broken file, still marks the other docs, and exits 1", async () => {
    const root = await fixture({
      ".ori/domain/x.md": "# x\n",
      ".ori/slices/broken/manifest.yaml": MANIFEST,
      ".ori/slices/broken/status.yaml": BROKEN,
      ".ori/slices/ok/manifest.yaml": MANIFEST,
      ".ori/slices/ok/status.yaml": "slice_id: ok\ndirty: []\n",
    });
    const r = run(root, ["--file", ".ori/domain/x.md"]);
    expect(r.out).toMatch(/\.ori\/slices\/broken\/status\.yaml:\d+:\d+/);
    expect(r.out).not.toMatch(/YAMLParseError|at .*\.js:\d+/);
    expect(r.code).toBe(1);
    // 壊れたファイルは触らない
    expect(await readFile(join(root, ".ori/slices/broken/status.yaml"), "utf8")).toBe(BROKEN);
    const ok = yamlParse(await readFile(join(root, ".ori/slices/ok/status.yaml"), "utf8"));
    expect(ok.dirty).toHaveLength(1);
    expect(ok.dirty[0].source.path).toBe(".ori/domain/x.md");
  });

  it("--check does not silently count a broken status.yaml as clean", async () => {
    const root = await fixture({
      ".ori/slices/broken/manifest.yaml": MANIFEST,
      ".ori/slices/broken/status.yaml": BROKEN,
    });
    // 変更なし (git repo でもない) → 残 dirty の検査だけが走る
    const r = run(root, ["--check"]);
    expect(r.out).toContain(".ori/slices/broken/status.yaml");
    expect(r.code).toBe(1);
  });
});
