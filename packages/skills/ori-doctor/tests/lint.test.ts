import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
// build-skills の出力 (skill に同梱される bundle) を実行する
const LINT = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-doctor", "scripts", "lint.js");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function runLint(files: Record<string, string>, extraArgs: string[] = [], target = ".ori") {
  const root = await mkdtemp(join(tmpdir(), "ori-doctor-lint-"));
  tmpDirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
  return spawnSync("node", [LINT, target, ...extraArgs], { cwd: root, encoding: "utf8" });
}

describe("lint.js frontmatter YAML error (ori-8ro7)", () => {
  const bad = "---\nreason: foo: bar\n---\n\n## Section {#ok}\n";
  const good = "---\ntitle: ok\n---\n\n## Missing anchor\n";

  it("does not crash: reports the broken file path as a warning and keeps checking others", async () => {
    const r = await runLint({
      ".ori/proposals/broken.md": bad,
      ".ori/other.md": good,
    });
    const out = r.stdout + r.stderr;
    expect(out).not.toMatch(/YAMLException|at .*\.js:\d+/);
    expect(out).toContain(".ori/proposals/broken.md");
    expect(out).toMatch(/frontmatter/i);
    // 他ファイルの検査が続行されている
    expect(out).toContain(".ori/other.md");
    expect(out).toContain('missing {#kebab-id} anchor');
    expect(r.status).toBe(0);
  });

  it("exits 1 with --strict, same as other lint issues", async () => {
    const r = await runLint({ ".ori/proposals/broken.md": bad }, ["--strict"]);
    expect(r.stdout + r.stderr).not.toMatch(/YAMLException/);
    expect(r.status).toBe(1);
  });
});

describe("lint.js status.yaml YAML error (ori-6dr5)", () => {
  // clear-dirty.sh の旧 sed が作っていた形 (GitHub #133)
  const brokenDirty = "slice_id: a\ndirty: []\n  - source:\n      path: .ori/domain/x.md\nfinalized_at: 2026-06-30\n";
  const unquotedColon = "page_id: p\nnotes: fixed: quoted later\ndirty: []\n";

  it("reports each broken status.yaml with its path and line, and keeps checking", async () => {
    const r = await runLint({
      ".ori/slices/a/status.yaml": brokenDirty,
      ".ori/pages/p/status.yaml": unquotedColon,
      ".ori/scenarios/s/status.yaml": "scenario_id: s\ndirty: []\n",
    });
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/\.ori\/slices\/a\/status\.yaml:\d+\s+status\.yaml が YAML として parse できない/);
    expect(out).toMatch(/\.ori\/pages\/p\/status\.yaml:2\s+status\.yaml が YAML として parse できない/);
    expect(out).not.toContain(".ori/scenarios/s/status.yaml");
    expect(r.status).toBe(0);
  });

  it("exits 1 with --strict", async () => {
    const r = await runLint({ ".ori/slices/a/status.yaml": brokenDirty }, ["--strict"]);
    expect(r.status).toBe(1);
  });

  it("also finds status.yaml when linting the project root or a sub dir of .ori", async () => {
    for (const target of [".", ".ori/slices"]) {
      const r = await runLint({ ".ori/slices/a/status.yaml": brokenDirty }, [], target);
      expect(r.stdout + r.stderr).toMatch(/\.ori\/slices\/a\/status\.yaml:\d+\s+status\.yaml が YAML として parse できない/);
    }
  });
});
