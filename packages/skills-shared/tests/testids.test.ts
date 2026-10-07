import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const SKILLS = [
  "ori-ddd-11b-ui-grouping",
  "ori-derive",
  "ori-doctor",
  "ori-generate",
  "ori-impl-green",
  "ori-review",
  "ori-test-red",
];
const scriptOf = (skill: string): string => join(REPO_ROOT, ".apm", "skills", skill, "scripts", "testids.js");
const SCRIPT = scriptOf("ori-generate");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  all: string;
}

async function run(args: string[], cwd: string): Promise<RunResult> {
  try {
    const r = await execFileAsync("node", [SCRIPT, ...args], { cwd });
    return { code: 0, stdout: r.stdout, stderr: r.stderr, all: r.stdout + r.stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      all: (e.stdout ?? "") + (e.stderr ?? ""),
    };
  }
}

async function withFixture(files: Record<string, string>, fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ori-testids-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body, "utf8");
    }
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function screen(n: number, elems: string[]): string {
  const rows = elems.map((e) => `| \`{#screen-${n}-${e}}\` | ${e} | (action) | - | button | |`).join("\n");
  return [
    `# Screen ${n} {#screen-${n}}`,
    "",
    "## Purpose {#purpose}",
    "",
    `| \`{#screen-${n}-not-a-field}\` | purpose 節の表は対象外 |`,
    "",
    "## Fields {#fields}",
    "",
    "| id | label | 型 | 必須 | UI | 備考 |",
    "|--|--|--|--|--|--|",
    rows,
    "",
    "## Cross-Field Rules {#cross-field-rules}",
    "",
  ].join("\n");
}

function manifest(id: string, type: string, screens: number[]): string {
  const derives = screens.map((n) => `  - domain/ui-fields/screen-${n}.md#screen-${n}`).join("\n");
  return `page_id: "${id}"\ntype: ${type}\nderives_from:\n${derives || "  []"}\n`;
}

const CONFIG = "ori:\n  workspace:\n    apps_root: apps\n    apps:\n      - name: app\n        path: apps/app\n";

const BASE: Record<string, string> = {
  ".ori/config.yaml": CONFIG,
  ".ori/domain/ui-fields/screen-1.md": screen(1, ["draft-body", "toolbar-sort-field"]),
  ".ori/domain/ui-fields/screen-2.md": screen(2, ["save", "theme"]),
  ".ori/pages/page-main/manifest.yaml": manifest("page-main", "page", [1]),
  ".ori/pages/settings/manifest.yaml": manifest("settings", "widget", [2]),
};

async function contract(root: string, id: string): Promise<{ derived: unknown[]; extra: Record<string, string>[] }> {
  return yamlParse(await readFile(join(root, ".ori/pages", id, "testids.yaml"), "utf8"));
}

describe("testids.js — 複製配置", () => {
  it("7 skill の scripts/testids.js は同一 bundle", async () => {
    const hashes = await Promise.all(
      SKILLS.map(async (s) => createHash("sha256").update(await readFile(scriptOf(s))).digest("hex")),
    );
    expect(new Set(hashes).size).toBe(1);
  });
});

describe("testids.js — project root 解決", () => {
  it("cwd が .ori 配下でも上方探索で root を解決する", async () => {
    await withFixture(BASE, async (root) => {
      const r = await run(["sync", "page-main"], join(root, ".ori", "pages"));
      expect(r.code).toBe(0);
      expect((await contract(root, "page-main")).derived).toHaveLength(2);
    });
  });

  it("--root で明示指定できる", async () => {
    await withFixture(BASE, async (root) => {
      const r = await run(["sync", "page-main", "--root", root], tmpdir());
      expect(r.code).toBe(0);
    });
  });

  it(".ori が見つからなければ exit 2", async () => {
    const empty = await mkdtemp(join(tmpdir(), "ori-testids-empty-"));
    try {
      const r = await run(["sync", "page-main"], empty);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("project root");
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe("testids.js sync", () => {
  it("page / widget の derived を <kind>.<id>.<elem> で導出し testid 昇順に並べる", async () => {
    await withFixture(BASE, async (root) => {
      expect((await run(["sync", "--all"], root)).code).toBe(0);
      expect((await contract(root, "page-main")).derived).toEqual([
        { testid: "page.page-main.draft-body", field: "screen-1-draft-body" },
        { testid: "page.page-main.toolbar-sort-field", field: "screen-1-toolbar-sort-field" },
      ]);
      expect((await contract(root, "settings")).derived).toEqual([
        { testid: "widget.settings.save", field: "screen-2-save" },
        { testid: "widget.settings.theme", field: "screen-2-theme" },
      ]);
    });
  });

  it("複数 screen を持つ page は全 screen の field を含む", async () => {
    await withFixture(
      { ...BASE, ".ori/pages/page-main/manifest.yaml": manifest("page-main", "page", [1, 2]) },
      async (root) => {
        expect((await run(["sync", "page-main"], root)).code).toBe(0);
        expect((await contract(root, "page-main")).derived).toHaveLength(4);
      },
    );
  });

  it("冪等: 2 回目は byte 一致で up-to-date", async () => {
    await withFixture(BASE, async (root) => {
      await run(["sync", "page-main"], root);
      const first = await readFile(join(root, ".ori/pages/page-main/testids.yaml"), "utf8");
      const r = await run(["sync", "page-main"], root);
      expect(r.stdout).toContain("up-to-date");
      expect(await readFile(join(root, ".ori/pages/page-main/testids.yaml"), "utf8")).toBe(first);
    });
  });

  it("extra を保持したまま derived だけ再生成する", async () => {
    await withFixture(BASE, async (root) => {
      await run(["add-extra", "page-main", "--testid", "page.page-main", "--purpose", "root", "--source", "derive"], root);
      await writeFile(
        join(root, ".ori/domain/ui-fields/screen-1.md"),
        screen(1, ["draft-body", "toolbar-sort-field", "block-body"]),
        "utf8",
      );
      expect((await run(["sync", "page-main"], root)).code).toBe(0);
      const c = await contract(root, "page-main");
      expect(c.derived).toHaveLength(3);
      expect(c.extra).toEqual([{ testid: "page.page-main", purpose: "root", source: "derive" }]);
    });
  });

  it("page 未 scaffold は exit 1", async () => {
    await withFixture(BASE, async (root) => {
      const r = await run(["sync", "nope"], root);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("未 scaffold");
    });
  });

  it("derives_from の screen ファイルが無ければ exit 1", async () => {
    await withFixture(
      { ...BASE, ".ori/pages/page-main/manifest.yaml": manifest("page-main", "page", [9]) },
      async (root) => {
        const r = await run(["sync", "page-main"], root);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain("screen-9.md");
      },
    );
  });

  it("screen 参照が無い page は WARN で derived 空", async () => {
    await withFixture(
      { ...BASE, ".ori/pages/page-main/manifest.yaml": manifest("page-main", "page", []) },
      async (root) => {
        const r = await run(["sync", "page-main"], root);
        expect(r.code).toBe(0);
        expect(r.stderr).toContain("WARN");
        expect((await contract(root, "page-main")).derived).toEqual([]);
      },
    );
  });

  it("page 内で <elem> が衝突したら exit 1 (書き込まない)", async () => {
    await withFixture(
      {
        ...BASE,
        ".ori/domain/ui-fields/screen-3.md": screen(3, ["save"]),
        ".ori/pages/settings/manifest.yaml": manifest("settings", "widget", [2, 3]),
      },
      async (root) => {
        const r = await run(["sync", "settings"], root);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('"save": screen-2-save, screen-3-save');
        await expect(readFile(join(root, ".ori/pages/settings/testids.yaml"))).rejects.toThrow();
      },
    );
  });
});

describe("testids.js check", () => {
  const IMPL_OK =
    '<div data-testid="page.page-main">\n' +
    '  <textarea data-testid="page.page-main.draft-body"></textarea>\n' +
    "  <select data-testid={'page.page-main.toolbar-sort-field'}></select>\n" +
    "</div>\n";

  it("契約どおりの実装なら exit 0", async () => {
    await withFixture(
      { ...BASE, "apps/app/src/PageMain.svelte": IMPL_OK, "apps/app/src/S.svelte": '<b data-testid="widget.settings.save"/><b data-testid="widget.settings.theme"/>' },
      async (root) => {
        await run(["sync", "--all"], root);
        await run(["add-extra", "page-main", "--testid", "page.page-main", "--purpose", "root", "--source", "derive"], root);
        const r = await run(["check", "--all"], root);
        expect(r.all).toContain("OK");
        expect(r.code).toBe(0);
      },
    );
  });

  it("testids.yaml が無い / derived が stale を検出する", async () => {
    await withFixture(BASE, async (root) => {
      let r = await run(["check", "page-main", "--no-impl"], root);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain("testids.yaml がありません");

      await run(["sync", "page-main"], root);
      await writeFile(join(root, ".ori/domain/ui-fields/screen-1.md"), screen(1, ["draft-body"]), "utf8");
      r = await run(["check", "page-main", "--no-impl"], root);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain("stale");
    });
  });

  it("extra の形式違反・重複を検出する", async () => {
    await withFixture(BASE, async (root) => {
      await run(["sync", "page-main"], root);
      const p = join(root, ".ori/pages/page-main/testids.yaml");
      const body = await readFile(p, "utf8");
      await writeFile(
        p,
        body.replace(
          "extra: []",
          "extra:\n" +
            "  - testid: page.other.x\n    purpose: wrong prefix\n    source: derive\n" +
            "  - testid: page.page-main.draft-body\n    purpose: dup\n    source: derive\n" +
            "  - testid: page.page-main.y\n    purpose: bad source\n    source: impl\n",
        ),
        "utf8",
      );
      const r = await run(["check", "page-main", "--no-impl"], root);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('extra 形式違反: "page.other.x"');
      expect(r.stdout).toContain('testid 重複: "page.page-main.draft-body"');
      expect(r.stdout).toContain('extra source 不正: "page.page-main.y"');
    });
  });

  it("契約 testid が実装に無ければ違反 (テストファイル中の selector は数えない)", async () => {
    await withFixture(
      {
        ...BASE,
        "apps/app/src/PageMain.svelte": '<textarea data-testid="page.page-main.draft-body"></textarea>',
        "apps/app/src/tests/PageMain.test.ts": "q('[data-testid=\"page.page-main.toolbar-sort-field\"]')",
        "apps/app/src/lib/query.ts": "document.querySelector('[data-testid=\"page.page-main.toolbar-sort-field\"]')",
      },
      async (root) => {
        await run(["sync", "page-main"], root);
        const r = await run(["check", "page-main"], root);
        expect(r.code).toBe(1);
        expect(r.stdout).toContain('実装に存在しません: "page.page-main.toolbar-sort-field"');
        expect(r.stdout).not.toContain('"page.page-main.draft-body"');
      },
    );
  });

  it("動的 testid・形式違反・存在しない page 参照を lint する", async () => {
    await withFixture(
      {
        ...BASE,
        "apps/app/src/T.svelte":
          "<b data-testid={`page.page-main.opt-${v}`}/>\n" +
          "<b data-testid={name}/>\n" +
          '<b :data-testid="name"/>\n' +
          '<b data-testid="screen-1-sort_field"/>\n' +
          '<b data-testid="widget.ghost.x"/>\n',
        "apps/app/node_modules/pkg/x.js": '<b data-testid={x}/>',
      },
      async (root) => {
        await run(["sync", "page-main"], root);
        const r = await run(["check", "page-main"], root);
        expect(r.code).toBe(1);
        expect(r.stdout.match(/動的 testid は禁止/g)).toHaveLength(3);
        expect(r.stdout).toContain('testid 形式違反 (kebab-case を . で連結): "screen-1-sort_field"');
        expect(r.stdout).toContain('存在しない page / widget を指しています: "widget.ghost.x"');
        expect(r.stdout).not.toContain("node_modules");
      },
    );
  });

  it("--no-impl は実装側の検査を skip する", async () => {
    await withFixture({ ...BASE, "apps/app/src/T.svelte": "<b data-testid={x}/>" }, async (root) => {
      await run(["sync", "page-main"], root);
      const r = await run(["check", "page-main", "--no-impl"], root);
      expect(r.code).toBe(0);
    });
  });
});

describe("testids.js add-extra", () => {
  it("testids.yaml が無くても sync してから追記する", async () => {
    await withFixture(BASE, async (root) => {
      const r = await run(
        ["add-extra", "settings", "--testid", "widget.settings.theme-option", "--purpose", "選択肢", "--source", "scenario:s1-x", "--dynamic", "data-key"],
        root,
      );
      expect(r.code).toBe(0);
      const c = await contract(root, "settings");
      expect(c.derived).toHaveLength(2);
      expect(c.extra).toEqual([
        { testid: "widget.settings.theme-option", purpose: "選択肢", source: "scenario:s1-x", dynamic: "data-key" },
      ]);
    });
  });

  it("登録済み testid (derived / extra) は no-op", async () => {
    await withFixture(BASE, async (root) => {
      const r = await run(["add-extra", "settings", "--testid", "widget.settings.save", "--purpose", "x", "--source", "derive"], root);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("登録済み");
      expect((await contract(root, "settings")).extra).toEqual([]);
    });
  });

  it("形式違反は reject し、ファイルを変えない", async () => {
    await withFixture(BASE, async (root) => {
      await run(["sync", "settings"], root);
      const before = await readFile(join(root, ".ori/pages/settings/testids.yaml"), "utf8");
      const r = await run(["add-extra", "settings", "--testid", "screen-2-error", "--purpose", "x", "--source", "derive"], root);
      expect(r.code).toBe(1);
      expect(await readFile(join(root, ".ori/pages/settings/testids.yaml"), "utf8")).toBe(before);
    });
  });

  it("必須引数が欠けたら usage (exit 2)", async () => {
    await withFixture(BASE, async (root) => {
      const r = await run(["add-extra", "settings", "--testid", "widget.settings.x"], root);
      expect(r.code).toBe(2);
    });
  });
});

describe("testids.js check-collisions", () => {
  const groups = (body: string): string => `# Page Groups {#page-groups}\n\n${body}\n`;

  it("11b テンプレート形式 (depends_on: ui-field:screen-N) で衝突を検出する", async () => {
    await withFixture(
      {
        ...BASE,
        ".ori/domain/ui-fields/screen-3.md": screen(3, ["save"]),
        ".ori/domain/ui-fields/page-groups.md": groups(
          "## browser {#browser}\n\n- type: ui-page\n- depends_on:\n  - ui-field:screen-2\n  - ui-field:screen-3\n",
        ),
      },
      async (root) => {
        const r = await run(["check-collisions"], root);
        expect(r.code).toBe(1);
        expect(r.stdout).toContain('browser: <elem> "save" が衝突: screen-2-save, screen-3-save');
      },
    );
  });

  it("screens: link 形式を拾い、本文中の screen-N.md 言及は grouping にしない", async () => {
    await withFixture(
      {
        ...BASE,
        ".ori/domain/ui-fields/screen-3.md": screen(3, ["save"]),
        ".ori/domain/ui-fields/page-groups.md": groups(
          "## Groups {#groups}\n\n### main {#main}\n\n- **screens**: [screen-2](screen-2.md)\n" +
            "- mount: `screen-1-toolbar-settings-button`\n\n" +
            "### toast {#toast}\n\n- **screens**: [screen-3](screen-3.md)\n\n" +
            "## Layering {#layering}\n\n- 衝突しない (screen-2.md / screen-3.md 参照)\n",
        ),
      },
      async (root) => {
        const r = await run(["check-collisions"], root);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain("2 grouping");
      },
    );
  });

  it("grouping を解析できなければ WARN (exit 0)", async () => {
    await withFixture({ ...BASE, ".ori/domain/ui-fields/page-groups.md": groups("## a {#a}\n\nfree text\n") }, async (root) => {
      const r = await run(["check-collisions"], root);
      expect(r.code).toBe(0);
      expect(r.stderr).toContain("WARN");
    });
  });
});

describe("testids.js — review 指摘の回帰 (ori-oan.7)", () => {
  it("M2: derives_from の ui-field:screen-N / page-groups.md#<grouping> を screen として解決する", async () => {
    await withFixture(
      {
        ...BASE,
        ".ori/domain/ui-fields/page-groups.md":
          "# Page Groups {#page-groups}\n\n## settings {#settings}\n\n- depends_on:\n  - ui-field:screen-2\n",
        ".ori/pages/page-main/manifest.yaml": "type: page\nderives_from:\n  - ui-field:screen-1\n",
        ".ori/pages/settings/manifest.yaml": "type: widget\nderives_from:\n  - domain/ui-fields/page-groups.md#settings\n",
      },
      async (root) => {
        expect((await run(["sync", "--all"], root)).code).toBe(0);
        expect((await contract(root, "page-main")).derived).toHaveLength(2);
        expect((await contract(root, "settings")).derived).toHaveLength(2);
      },
    );
  });

  it("M2: screen を解決できない page は check で違反 (空契約で素通りさせない)", async () => {
    await withFixture(
      { ...BASE, ".ori/pages/page-main/manifest.yaml": "type: page\nderives_from:\n  - domain/workflows/x.md#x\n" },
      async (root) => {
        await run(["sync", "page-main"], root);
        const r = await run(["check", "page-main", "--no-impl"], root);
        expect(r.code).toBe(1);
        expect(r.stdout).toContain("ui-fields screen を解決できません");
      },
    );
  });

  it("M3: Open Questions や anchor なし見出し配下の言及を grouping にしない", async () => {
    await withFixture(
      {
        ...BASE,
        ".ori/domain/ui-fields/screen-3.md": screen(3, ["save"]),
        ".ori/domain/ui-fields/page-groups.md":
          "# Page Groups {#page-groups}\n\n## capture {#capture}\n\n- depends_on:\n  - ui-field:screen-1\n  - workflow:capture\n" +
          "- 対応 workflow: capture\n\n### Notes\n\n- ui-field:screen-2 と ui-field:screen-3 は別\n\n" +
          "## settings {#settings}\n\n- depends_on:\n  - ui-field:screen-2\n\n" +
          "## Open Questions {#open-questions}\n\n- ui-field:screen-2 と ui-field:screen-3 を同 page にするか\n",
      },
      async (root) => {
        const r = await run(["check-collisions"], root);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain("2 grouping");
      },
    );
  });

  it("M4: sync は extra のコメントを保持し、壊れた構造は書き換えずに停止する", async () => {
    await withFixture(BASE, async (root) => {
      const p = join(root, ".ori/pages/page-main/testids.yaml");
      await writeFile(
        p,
        "derived: []\nextra: # human note: keep root first\n  - testid: page.page-main # root\n    purpose: root\n    source: derive\n",
        "utf8",
      );
      expect((await run(["sync", "page-main"], root)).code).toBe(0);
      await run(["add-extra", "page-main", "--testid", "page.page-main.x", "--purpose", "x", "--source", "derive"], root);
      const body = await readFile(p, "utf8");
      expect(body).toContain("# human note: keep root first");
      expect(body).toContain("# root");
      expect((await contract(root, "page-main")).extra.map((r) => r.testid)).toEqual(["page.page-main", "page.page-main.x"]);

      const broken = "derived: []\nextra:\n  testid: page.page-main\n  purpose: root\n  source: derive\n";
      await writeFile(p, broken, "utf8");
      const r = await run(["sync", "page-main"], root);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("extra が配列ではありません");
      expect(await readFile(p, "utf8")).toBe(broken);
    });
  });

  it("M1: 壊れた YAML は ERROR で exit 1 (stack trace で落ちない)", async () => {
    await withFixture({ ...BASE, ".ori/config.yaml": "ori:\n  workspace: [unclosed\n" }, async (root) => {
      await run(["sync", "page-main"], root);
      const r = await run(["check", "page-main"], root);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("ERROR: YAML を parse できません");
    });
  });

  it("L1: 衝突の詳細は 1 行の VIOLATION に field まで含める", async () => {
    await withFixture(
      {
        ...BASE,
        ".ori/domain/ui-fields/screen-3.md": screen(3, ["save"]),
        ".ori/pages/settings/manifest.yaml": manifest("settings", "widget", [2, 3]),
      },
      async (root) => {
        const r = await run(["check", "settings", "--no-impl"], root);
        expect(r.stdout).toMatch(/^VIOLATION settings: page 内で <elem> が衝突しています \(<elem> "save": screen-2-save, screen-3-save\)/m);
      },
    );
  });

  it("L3/L4/L5: route 名 test/ は探索し、改行をまたぐ属性と Vue の静的 bind を literal として扱う", async () => {
    await withFixture(
      {
        ...BASE,
        "apps/app/src/routes/test/+page.svelte": '<textarea data-testid="page.page-main.draft-body"></textarea>',
        "apps/app/src/Sort.tsx": '<select\n  data-testid={\n    "page.page-main.toolbar-sort-field"\n  }\n/>',
        "apps/app/src/S.vue": "<b :data-testid=\"'widget.settings.save'\"/><b v-bind:data-testid=\"'widget.settings.theme'\"/>",
      },
      async (root) => {
        await run(["sync", "--all"], root);
        const r = await run(["check", "--all"], root);
        expect(r.stdout).toContain("OK");
        expect(r.code).toBe(0);
      },
    );
  });

  it("build 成果物 (build/ gen/) は探索せず、そこにある testid で契約を満たしたことにしない", async () => {
    await withFixture(
      {
        ...BASE,
        "apps/app/build/_app/x.js": '<b data-testid="page.page-main.draft-body"/><b data-testid="bad_id"/>',
        "apps/app/src-tauri/gen/y.js": '<b data-testid="page.page-main.toolbar-sort-field"/>',
      },
      async (root) => {
        await run(["sync", "page-main"], root);
        const r = await run(["check", "page-main"], root);
        expect(r.stdout).toContain('実装に存在しません: "page.page-main.draft-body"');
        expect(r.stdout).toContain('実装に存在しません: "page.page-main.toolbar-sort-field"');
        expect(r.stdout).not.toContain("bad_id");
      },
    );
  });

  it("L8: 値を取るフラグの値が欠けたら usage (exit 2)", async () => {
    await withFixture(BASE, async (root) => {
      expect((await run(["sync", "page-main", "--root"], root)).code).toBe(2);
      const r = await run(["add-extra", "settings", "--testid", "widget.settings.x", "--purpose", "--source", "derive"], root);
      expect(r.code).toBe(2);
    });
  });
});
