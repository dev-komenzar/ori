import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-doctor", "scripts");
const SCRIPT = join(SCRIPTS, "check-page-testids.sh");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const SCREEN =
  "# Screen 1 {#screen-1}\n\n## Fields {#fields}\n\n| id | label |\n|--|--|\n| `{#screen-1-save}` | 保存 |\n";

async function run(files: Record<string, string>, args: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), "ori-page-testids-"));
  tmpDirs.push(root);
  await mkdir(join(root, ".ori"), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  const r = spawnSync("bash", [SCRIPT, ...args], { cwd: root, encoding: "utf8" });
  return { out: r.stdout + r.stderr, code: r.status };
}

const PAGE = {
  ".ori/domain/ui-fields/screen-1.md": SCREEN,
  ".ori/pages/main/manifest.yaml": "type: page\nderives_from:\n  - domain/ui-fields/screen-1.md#screen-1\n",
};

describe("check-page-testids.sh", () => {
  it("page が無ければ skip (exit 0)", async () => {
    const r = await run({});
    expect(r.code).toBe(0);
    expect(r.out).toContain("no .ori/pages");
  });

  it("契約が無い page を違反として件数で返す", async () => {
    const r = await run(PAGE);
    expect(r.code).toBe(1);
    expect(r.out).toContain("main: testids.yaml がありません");
    expect(r.out).toContain("1 issue(s)");
  });

  it("契約どおり実装されていれば 0 issue", async () => {
    const r = await run({
      ...PAGE,
      ".ori/pages/main/testids.yaml":
        "derived:\n  - testid: page.main.save\n    field: screen-1-save\nextra: []\n",
      "apps/app/src/Main.svelte": '<button data-testid="page.main.save"></button>',
    });
    expect(r.out).toContain("0 issue(s)");
    expect(r.code).toBe(0);
  });

  it("実装不在と動的 testid を数える", async () => {
    const r = await run({
      ...PAGE,
      ".ori/pages/main/testids.yaml":
        "derived:\n  - testid: page.main.save\n    field: screen-1-save\nextra: []\n",
      "apps/app/src/Main.svelte": "<button data-testid={`page.main.${k}`}></button>",
    });
    expect(r.code).toBe(2);
    expect(r.out).toContain('実装に存在しません: "page.main.save"');
    expect(r.out).toContain("動的 testid は禁止");
  });
});
