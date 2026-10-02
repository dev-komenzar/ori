import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(
  __dirname, "..", "..", "..", "..",
  ".apm", "skills", "ori-doctor", "scripts", "check-ui-fields-traceability.sh",
);

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

// files: .ori/ からの相対 path → 内容
async function run(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "ori-uif-trace-"));
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

const screen = (body: string) => `# S {#screen-1}\n\n## Fields {#fields}\n\n${body}\n`;
const spec = (points: string, extra = "") =>
  `# Spec\n\n## テスト観点 {#test-points}\n\n${points}\n\n## other {#other}\n\n${extra}\n`;

describe("check-ui-fields-traceability.sh", () => {
  it("(a) 未写像の field id → WARN + exit≥1", async () => {
    const r = await run({
      "domain/ui-fields/screen-1.md": screen("| {#screen-1-note-body} | 本文 |"),
      "scenarios/s1/spec.md": spec("- 無関係な項目"),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("screen-1#screen-1-note-body");
    expect(r.out).toContain("1 issue(s)");
  });

  it("(b) 写像済み (purpose 一致 / '-' と空白の表記ゆれ) → 0 issue", async () => {
    const r = await run({
      "domain/ui-fields/screen-1.md": screen("| {#screen-1-note-body} | 本文 |\n- Cmd+N で新規"),
      "scenarios/s1/spec.md": spec("- note body に入力すると保存される\n- Cmd+N で新規ノート"),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 issue(s)");
  });

  it("(c) Cmd/Ctrl/⌘/Command と空白の表記ゆれを同一視", async () => {
    const r = await run({
      "domain/ui-fields/screen-1.md": screen("- Cmd+N\n- Ctrl + Shift + K\n- ⌘S"),
      "scenarios/s1/spec.md": spec("- Ctrl+N で新規\n- Command+Shift+K で検索\n- ⌘ + S で保存"),
    });
    expect(r.code).toBe(0);
  });

  it("(d) fenced code 内 / test-points 節外の記述は写像扱いにしない", async () => {
    const r = await run({
      "domain/ui-fields/screen-1.md": screen("- Cmd+K\n- Cmd+J"),
      "scenarios/s1/spec.md": spec("- 項目\n\n```\nCmd+K\n```", "- Cmd+J はここ (節外)"),
    });
    expect(r.code).toBe(2);
    expect(r.out).toContain("'Cmd+K'");
    expect(r.out).toContain("'Cmd+J'");
  });

  it("(e) screen/ui-fields 無し・test-points 無しは skip で exit 0", async () => {
    const a = await run({ "scenarios/s1/spec.md": spec("- x") });
    expect(a.code).toBe(0);
    expect(a.out).toContain("skipped");
    const b = await run({ "domain/ui-fields/screen-1.md": screen("| {#screen-1-title} | t |") });
    expect(b.code).toBe(0);
    expect(b.out).toContain("skipped");
  });

  describe("(f) 回帰", () => {
    it("MEDIUM-1: title/tag は titlebar/tagline に部分一致しない", async () => {
      const r = await run({
        "domain/ui-fields/screen-1.md": screen("| {#screen-1-title} | t |\n| {#screen-1-tag} | g |"),
        "scenarios/s1/spec.md": spec("- titlebar は表示されない (tagline)"),
      });
      expect(r.code).toBe(2);
      expect(r.out).toContain("screen-1-title");
      expect(r.out).toContain("screen-1-tag");
    });

    it("MEDIUM-1: field id も境界つき (screen-1-title ≠ screen-1-titlebar)", async () => {
      const r = await run({
        "domain/ui-fields/screen-1.md": screen("| {#screen-1-title} | t |"),
        "scenarios/s1/spec.md": spec("- screen-1-titlebar を確認"),
      });
      expect(r.code).toBe(1);
    });

    it("MEDIUM-2: ui-fields/README.md の cross-screen shortcut も検査", async () => {
      const r = await run({
        "domain/ui-fields/screen-1.md": screen("| {#screen-1-note-body} | n |"),
        "domain/ui-fields/README.md": "## Cross-screen shortcuts {#cross-screen-shortcuts}\n\n- Cmd+K\n",
        "scenarios/s1/spec.md": spec("- note-body"),
      });
      expect(r.code).toBe(1);
      expect(r.out).toContain("ui-fields/README");
      expect(r.out).toContain("'Cmd+K'");
    });

    it("MEDIUM-3: Cmd+Enter は Cmd+E / Cmd+Edit で写像済みにならない", async () => {
      const r = await run({
        "domain/ui-fields/screen-1.md": screen("- Cmd+Enter"),
        "scenarios/s1/spec.md": spec("- Cmd+E で何か\n- Cmd+Edit は別物"),
      });
      expect(r.code).toBe(1);
      expect(r.out).toContain("'Cmd+Enter'");
      const ok = await run({
        "domain/ui-fields/screen-1.md": screen("- Cmd+Enter"),
        "scenarios/s1/spec.md": spec("- Cmd+Enter で送信"),
      });
      expect(ok.code).toBe(0);
    });

    it("LOW-1: ⌘S ('+' 無し) も抽出される", async () => {
      const r = await run({
        "domain/ui-fields/screen-1.md": screen("- ⌘S"),
        "scenarios/s1/spec.md": spec("- 無関係"),
      });
      expect(r.code).toBe(1);
      expect(r.out).toContain("'⌘S'");
    });

    it("LOW-2: commander/controller の語を修飾キー扱いしない", async () => {
      const r = await run({
        "domain/ui-fields/screen-1.md": screen("- Cmd+N"),
        "scenarios/s1/spec.md": spec("- commander n / controller+n"),
      });
      expect(r.code).toBe(1);
    });

    it("LOW-3: page / slice の spec.md#test-points も corpus に含める", async () => {
      const r = await run({
        "domain/ui-fields/screen-1.md": screen("| {#screen-1-note-body} | n |\n- Cmd+N"),
        "pages/p1/spec.md": spec("- note-body"),
        "slices/sl1/spec.md": spec("- Cmd+N"),
        "scenarios/s1/spec.md": spec("- 無関係"),
      });
      expect(r.code).toBe(0);
    });
  });
});
