import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS = join(__dirname, "..", "..", "..", "..", ".apm", "skills");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("全 SKILL.md の frontmatter (ori-w8jg)", () => {
  it("YAML として parse でき、name と description が文字列で入る", async () => {
    const failures: string[] = [];
    for (const entry of await readdir(SKILLS, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // SKILL.md を持たない dir (例: _hello 等の補助 dir) は skill ではない
      const raw = await readFile(join(SKILLS, entry.name, "SKILL.md"), "utf8").catch(() => null);
      if (raw === null) continue;
      const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
      if (!m) {
        failures.push(`${entry.name}: frontmatter が無い`);
        continue;
      }
      try {
        const data = YAML.parse(m[1]!) as Record<string, unknown>;
        if (data.name !== entry.name) failures.push(`${entry.name}: name=${String(data.name)}`);
        if (typeof data.description !== "string" || data.description === "") {
          failures.push(`${entry.name}: description が文字列でない`);
        }
      } catch (err) {
        failures.push(`${entry.name}: ${(err as Error).message.split("\n")[0]}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("lint.js: ori-architect SKILL.md の frontmatter が不正 (ori-w8jg)", () => {
  it("YAMLException で落ちず、SKILL.md のパスを指す issue にして続行する", async () => {
    // bundle 隣接の ../../ori-architect/SKILL.md を読む配置を tmp に再現する
    const root = await mkdtemp(join(tmpdir(), "ori-doctor-skillfm-"));
    tmpDirs.push(root);
    const bundleDir = join(root, "skills", "ori-doctor", "scripts");
    await mkdir(bundleDir, { recursive: true });
    await copyFile(join(SKILLS, "ori-doctor", "scripts", "lint.js"), join(bundleDir, "lint.js"));
    await mkdir(join(root, "skills", "ori-architect"), { recursive: true });
    await writeFile(
      join(root, "skills", "ori-architect", "SKILL.md"),
      "---\nname: ori-architect\ndescription: `/x` bad\n---\n\n本文\n",
    );
    const proj = join(root, "proj");
    await mkdir(join(proj, ".ori"), { recursive: true });
    await writeFile(join(proj, ".ori", "architecture.md"), "---\ntitle: a\n---\n\n## Sec {#ok}\n");

    const r = spawnSync("node", [join(bundleDir, "lint.js"), ".ori"], { cwd: proj, encoding: "utf8" });
    const out = r.stdout + r.stderr;
    expect(out).not.toMatch(/YAMLException|at .*\.js:\d+/);
    expect(out).toContain("ori-architect/SKILL.md");
    expect(out).toMatch(/frontmatter/i);
    expect(r.status).toBe(0);
  });
});
