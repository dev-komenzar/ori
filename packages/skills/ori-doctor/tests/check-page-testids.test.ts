import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("check-page-testids.sh — review 指摘の回帰 (ori-oan.7)", () => {
  it("M1: testids.js が完走しない (壊れた config.yaml) 場合は green にしない", async () => {
    const r = await run({
      ...PAGE,
      ".ori/config.yaml": "ori:\n  workspace: [unclosed\n",
      ".ori/pages/main/testids.yaml":
        "derived:\n  - testid: page.main.save\n    field: screen-1-save\nextra: []\n",
    });
    expect(r.out).toContain("ERROR page testids");
    expect(r.code).not.toBe(0);
  });

  it("L2: --emit-issues は page 単位で起票し、kebab-case でない page id でも完走する", async () => {
    const bin = await mkdtemp(join(tmpdir(), "ori-fake-bd-"));
    tmpDirs.push(bin);
    const log = join(bin, "calls.log");
    await writeFile(join(bin, "bd"), `#!/usr/bin/env bash\necho "$*" >> "${log}"\n`, { mode: 0o755 });
    const root = await mkdtemp(join(tmpdir(), "ori-page-testids-"));
    tmpDirs.push(root);
    const files: Record<string, string> = {
      ...PAGE,
      ".ori/pages/Bad_Page/manifest.yaml": "type: page\nderives_from:\n  - domain/ui-fields/screen-1.md#screen-1\n",
    };
    for (const [rel, body] of Object.entries(files)) {
      const p = join(root, rel);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    }
    const r = spawnSync("bash", [SCRIPT, "--emit-issues"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const out = r.stdout + r.stderr;
    expect(out).toContain("page testids: 2 issue(s)");
    const calls = await readFile(log, "utf8");
    expect(calls).toContain("--labels=testid-violation,page:main");
    expect(calls).toContain("--labels=testid-violation,page:Bad_Page");
  });
});

describe("check-page-testids.sh — 移行経路 (ori-oan.13)", () => {
  const SCREEN2 =
    "# Screen 2 {#screen-2}\n\n## Fields {#fields}\n\n| id | label |\n|--|--|\n| `{#screen-2-theme}` | テーマ |\n";
  const TWO_PAGES = {
    ...PAGE,
    ".ori/domain/ui-fields/screen-2.md": SCREEN2,
    ".ori/pages/settings/manifest.yaml": "type: widget\nderives_from:\n  - domain/ui-fields/screen-2.md#screen-2\n",
    ".ori/pages/main/testids.yaml": "derived:\n  - testid: page.main.save\n    field: screen-1-save\nextra: []\n",
    ".ori/pages/settings/testids.yaml": "derived:\n  - testid: widget.settings.theme\n    field: screen-2-theme\nextra: []\n",
  };

  // bd の fake: list は open issue を返さず (EXISTING があればそれを返す)、create --silent は id を返す
  async function runWithBd(files: Record<string, string>, args: string[], existing = "") {
    const bin = await mkdtemp(join(tmpdir(), "ori-fake-bd-"));
    tmpDirs.push(bin);
    const log = join(bin, "calls.log");
    await writeFile(
      join(bin, "bd"),
      `#!/usr/bin/env bash\necho "$*" >> "${log}"\n` +
        `if [[ "$1" == list ]]; then printf '%s' "${existing}"; fi\n` +
        `if [[ "$1" == create ]]; then echo "ori-x1"; fi\n`,
      { mode: 0o755 },
    );
    const root = await mkdtemp(join(tmpdir(), "ori-page-testids-"));
    tmpDirs.push(root);
    for (const [rel, body] of Object.entries(files)) {
      const p = join(root, rel);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    }
    const r = spawnSync("bash", [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    let calls = "";
    try { calls = await readFile(log, "utf8"); } catch { /* bd 未呼び出し */ }
    return { out: r.stdout + r.stderr, code: r.status, calls };
  }

  it("ori-doctor と ori-generate の scripts/ に同一内容で複製される", async () => {
    const gen = join(SCRIPTS, "..", "..", "ori-generate", "scripts", "check-page-testids.sh");
    expect(await readFile(gen, "utf8")).toBe(await readFile(SCRIPT, "utf8"));
  });

  it("page id 指定はその page だけを検査する", async () => {
    const r = await run(TWO_PAGES, ["settings"]);
    expect(r.out).toContain('settings: 契約 testid が実装に存在しません: "widget.settings.theme"');
    expect(r.out).not.toContain("page.main.save");
    expect(r.out).toContain("1 issue(s)");
  });

  it("--implemented-only は旧 testid も契約 testid も無い page を飛ばす", async () => {
    const r = await run(
      { ...TWO_PAGES, "apps/app/src/Main.svelte": '<button data-testid="screen-1-save"></button>' },
      ["--implemented-only", "main", "settings"],
    );
    expect(r.out).toContain('main: 契約 testid が実装に存在しません: "page.main.save"');
    expect(r.out).not.toContain("widget.settings.theme");
    expect(r.out).toContain("1 issue(s)");
  });

  it("--emit-issues: 形式違反は帰属 page の issue に入り、本文に移行手順を書き、起票した id を出す", async () => {
    const r = await runWithBd(
      { ...TWO_PAGES, "apps/app/src/S.svelte": "<b data-testid={`screen-2-theme-${v}`}/>" },
      ["--emit-issues", "--implemented-only", "settings"],
    );
    expect(r.out).toContain("✓ filed bd issue ori-x1 (testid-violation, page:settings)");
    expect(r.calls).toContain("--labels=testid-violation,page:settings");
    expect(r.calls).not.toContain("page:_impl");
    expect(r.calls).toContain("ui-test.instructions.md#testid-migration");
    expect(r.calls).toContain("testids.js migrate-map settings");
    expect(r.calls).toContain("- settings: impl: apps/app/src/S.svelte:1: 動的 testid は禁止");
  });

  it("--emit-issues: open issue があれば re-file せず、その id を出す", async () => {
    const r = await runWithBd(TWO_PAGES, ["--emit-issues", "settings"], "○ ori-abc ● P2 [testid] settings: page testid 契約違反\n");
    expect(r.out).toContain("page:settings の open issue ori-abc あり");
    expect(r.calls).not.toContain("create");
  });

  it("未知の option は usage error (exit 2)", async () => {
    const r = await run(PAGE, ["--emit"]);
    expect(r.code).toBe(2);
  });
});
