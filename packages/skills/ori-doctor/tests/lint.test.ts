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

async function runLint(files: Record<string, string>, extraArgs: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), "ori-doctor-lint-"));
  tmpDirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
  return spawnSync("node", [LINT, ".ori", ...extraArgs], { cwd: root, encoding: "utf8" });
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
