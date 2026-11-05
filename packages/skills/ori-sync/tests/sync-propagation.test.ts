import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYNC = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-sync", "scripts", "sync.js");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function write(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
}

function git(root: string, ...a: string[]) {
  execFileSync("git", a, { cwd: root, stdio: "ignore" });
}

// files を commit した git repo を作る (HEAD との差分が /ori-sync の入力になる)
async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ori-sync-prop-"));
  tmpDirs.push(root);
  await write(root, files);
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "init");
  return root;
}

function run(root: string, args: string[] = []) {
  const r = spawnSync("node", [SYNC, ...args], { cwd: root, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

async function dirty(root: string, docDir: string): Promise<Array<{ source: { path: string; sectionId: string | null }; affected_phase: string }>> {
  const s = yamlParse(await readFile(join(root, docDir, "status.yaml"), "utf8"));
  return s?.dirty ?? [];
}

// 1 時間前に倒して「review 済み」の状態を作る / review.md を古くする
async function age(root: string, rel: string, secondsAgo = 3600): Promise<void> {
  const t = new Date(Date.now() - secondsAgo * 1000);
  await utimes(join(root, rel), t, t);
}

const DOMAIN = [
  "# Validation {#validation}",
  "",
  "## Scenario S1 {#s1}",
  "s1 body",
  "",
  "### Detail {#s1-detail}",
  "detail",
  "",
  "## Scenario S2 {#s2}",
  "s2 body",
  "",
].join("\n");

const scenarioManifest = (ref: string, extra = "") => `type: scenario\nderives_from:\n  - ${ref}\n${extra}`;
const CLEAN = "dirty: []\n";

describe("domain changes are matched per section (ori-t3vg)", () => {
  it("marks only the docs deriving from the edited section", async () => {
    const root = await repo({
      ".ori/domain/validation.md": DOMAIN,
      ".ori/scenarios/s1/manifest.yaml": scenarioManifest("domain/validation.md#s1"),
      ".ori/scenarios/s1/status.yaml": CLEAN,
      ".ori/scenarios/s2/manifest.yaml": scenarioManifest("domain/validation.md#s2"),
      ".ori/scenarios/s2/status.yaml": CLEAN,
      ".ori/slices/whole/manifest.yaml": "derives_from:\n  - domain/validation.md\n",
      ".ori/slices/whole/status.yaml": CLEAN,
      ".ori/slices/h1/manifest.yaml": "derives_from:\n  - domain/validation.md#validation\n",
      ".ori/slices/h1/status.yaml": CLEAN,
    });
    // H3 (s1 の子節) だけを編集 → 親の s1 は変化、s2 は不変
    await write(root, { ".ori/domain/validation.md": DOMAIN.replace("detail", "detail changed") });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(await dirty(root, ".ori/scenarios/s1")).toEqual([
      expect.objectContaining({ source: { path: ".ori/domain/validation.md", sectionId: "s1" }, affected_phase: "derive" }),
    ]);
    expect(await dirty(root, ".ori/scenarios/s2")).toEqual([]);
    // section 指定なし、H1 の anchor (節として追跡しない) はファイル単位で判定する
    expect(await dirty(root, ".ori/slices/whole")).toHaveLength(1);
    expect(await dirty(root, ".ori/slices/h1")).toHaveLength(1);
  });

  it("marks docs whose section was removed", async () => {
    const root = await repo({
      ".ori/domain/validation.md": DOMAIN,
      ".ori/scenarios/s2/manifest.yaml": scenarioManifest("domain/validation.md#s2"),
      ".ori/scenarios/s2/status.yaml": CLEAN,
    });
    await write(root, { ".ori/domain/validation.md": DOMAIN.slice(0, DOMAIN.indexOf("## Scenario S2")) });
    run(root);
    expect(await dirty(root, ".ori/scenarios/s2")).toHaveLength(1);
  });

  it("falls back to file level when the file has no committed version", async () => {
    const root = await repo({
      ".ori/scenarios/s2/manifest.yaml": scenarioManifest("domain/validation.md#s2"),
      ".ori/scenarios/s2/status.yaml": CLEAN,
    });
    await write(root, { ".ori/domain/validation.md": DOMAIN }); // 未追跡の新規文書
    run(root);
    expect(await dirty(root, ".ori/scenarios/s2")).toHaveLength(1);
  });
});

describe("change detection edge cases", () => {
  it("treats a heading rename under the same anchor as a change", async () => {
    const root = await repo({
      ".ori/domain/validation.md": DOMAIN,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/validation.md#s2\n",
      ".ori/slices/a/status.yaml": CLEAN,
    });
    await write(root, { ".ori/domain/validation.md": DOMAIN.replace("## Scenario S2 {#s2}", "## Scenario S2 renamed {#s2}") });
    run(root);
    expect(await dirty(root, ".ori/slices/a")).toHaveLength(1);
  });

  it("falls back to file level for a duplicated anchor", async () => {
    const dup = DOMAIN + "## Again {#s2}\nagain\n";
    const root = await repo({
      ".ori/domain/validation.md": dup,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/validation.md#s2\n",
      ".ori/slices/a/status.yaml": CLEAN,
    });
    await write(root, { ".ori/domain/validation.md": dup.replace("s1 body", "s1 body v2") });
    run(root);
    expect(await dirty(root, ".ori/slices/a")).toHaveLength(1);
  });

  it("detects non-ASCII file names", async () => {
    const root = await repo({
      ".ori/domain/検証.md": DOMAIN,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/検証.md#s2\n",
      ".ori/slices/a/status.yaml": CLEAN,
    });
    await write(root, { ".ori/domain/検証.md": DOMAIN.replace("s2 body", "s2 body v2") });
    run(root);
    expect(await dirty(root, ".ori/slices/a")).toHaveLength(1);
  });

  it("marks docs deriving from a renamed (moved away) domain file", async () => {
    const root = await repo({
      ".ori/domain/old.md": DOMAIN,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/old.md#s2\n",
      ".ori/slices/a/status.yaml": CLEAN,
    });
    git(root, "mv", ".ori/domain/old.md", ".ori/domain/new.md");
    run(root);
    expect(await dirty(root, ".ori/slices/a")).toEqual([
      expect.objectContaining({ source: { path: ".ori/domain/old.md", sectionId: "s2" } }),
    ]);
  });

  it("exits 2 when --since cannot be resolved", async () => {
    const root = await repo({ ".ori/slices/a/manifest.yaml": "derives_from: []\n" });
    const r = run(root, ["--since", "no-such-ref", "--check"]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("no-such-ref");
  });

  it("--file marks section refs even when the edit is already committed", async () => {
    const root = await repo({
      ".ori/domain/validation.md": DOMAIN,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/validation.md#s2\n",
      ".ori/slices/a/status.yaml": CLEAN,
    });
    run(root, ["--file", ".ori/domain/validation.md"]);
    expect(await dirty(root, ".ori/slices/a")).toHaveLength(1);
  });
});

describe("dirty propagation inside derived docs (ori-7jm.10)", () => {
  const base = {
    ".ori/domain/validation.md": DOMAIN,
    ".ori/pages/page-main/manifest.yaml": "type: page\nderives_from:\n  - domain/validation.md#s2\n",
    ".ori/pages/page-main/status.yaml": CLEAN,
    ".ori/pages/page-main/spec.md": "# page spec\n",
    ".ori/pages/page-main/testids.yaml": "testids: []\n",
    ".ori/scenarios/s1/manifest.yaml": scenarioManifest("domain/validation.md#s1", "pages:\n  - page-main\n"),
    ".ori/scenarios/s1/status.yaml": CLEAN,
    ".ori/scenarios/s1/spec.md": "# s1 spec\n",
    ".ori/scenarios/s1/wdio.conf.ts": "export const config = {};\n",
    ".ori/scenarios/s1/tests/s1.spec.ts": "// test\n",
    ".ori/scenarios/s1/review.md": "verdict: PASS\n",
    ".ori/scenarios/s1/notes.md": "notes\n",
  };

  it("marks the scenario per changed artifact with the phase to redo", async () => {
    const root = await repo(base);
    await age(root, ".ori/scenarios/s1/review.md");
    await write(root, {
      ".ori/scenarios/s1/spec.md": "# s1 spec v2\n",
      ".ori/scenarios/s1/tests/s1.spec.ts": "// test v2\n",
      ".ori/scenarios/s1/tests/new.spec.ts": "// new (untracked)\n",
      ".ori/scenarios/s1/wdio.conf.ts": "export const config = { x: 1 };\n",
      ".ori/scenarios/s1/notes.md": "notes v2\n", // 派生物ではないので対象外
      ".ori/pages/page-main/testids.yaml": "testids: [a]\n",
    });
    const r = run(root);
    expect(r.code).toBe(0);
    const marks = (await dirty(root, ".ori/scenarios/s1")).map((d) => `${d.source.path}|${d.affected_phase}`);
    expect(marks.sort()).toEqual(
      [
        ".ori/pages/page-main/testids.yaml|generate",
        ".ori/scenarios/s1/spec.md|generate",
        ".ori/scenarios/s1/tests/new.spec.ts|review",
        ".ori/scenarios/s1/tests/s1.spec.ts|review",
        ".ori/scenarios/s1/wdio.conf.ts|review",
      ].sort(),
    );
    // page 自身は testids.yaml の変更では dirty にならない (page の source ではない)
    expect(await dirty(root, ".ori/pages/page-main")).toEqual([]);
  });

  it("marks any doc whose manifest.yaml changed for re-derive", async () => {
    const root = await repo({ ...base, ".ori/pages/page-main/review.md": "verdict: PASS\n" });
    await age(root, ".ori/pages/page-main/review.md");
    await write(root, {
      ".ori/pages/page-main/manifest.yaml": "type: page\nderives_from:\n  - domain/validation.md#s2\n  - domain/validation.md#s1\n",
    });
    run(root);
    expect(await dirty(root, ".ori/pages/page-main")).toEqual([
      expect.objectContaining({ source: { path: ".ori/pages/page-main/manifest.yaml", sectionId: null }, affected_phase: "derive" }),
    ]);
  });

  it("does not re-mark changes the scenario review already covers", async () => {
    const root = await repo(base);
    await write(root, { ".ori/scenarios/s1/tests/s1.spec.ts": "// test v2\n" });
    await age(root, ".ori/scenarios/s1/tests/s1.spec.ts");
    // review.md (commit 時の mtime) の方が新しい → flow で review 済み
    run(root);
    expect(await dirty(root, ".ori/scenarios/s1")).toEqual([]);
  });

  it("does not mark a doc that has never been reviewed (first flow in progress)", async () => {
    const { [".ori/scenarios/s1/review.md"]: _r, ...noReview } = base;
    const root = await repo(noReview);
    await write(root, {
      ".ori/scenarios/s1/spec.md": "# s1 spec v2\n",
      ".ori/scenarios/s1/manifest.yaml": scenarioManifest("domain/validation.md#s1", "pages:\n  - page-main\n  - other\n"),
    });
    run(root);
    expect(await dirty(root, ".ori/scenarios/s1")).toEqual([]);
  });

  it("marks the scenario when a referenced page spec changes", async () => {
    const root = await repo(base);
    await age(root, ".ori/scenarios/s1/review.md");
    await write(root, { ".ori/pages/page-main/spec.md": "# page spec v2\n" });
    run(root);
    expect(await dirty(root, ".ori/scenarios/s1")).toEqual([
      expect.objectContaining({ source: { path: ".ori/pages/page-main/spec.md", sectionId: null }, affected_phase: "generate" }),
    ]);
  });

  it("marks a deleted scenario test for review", async () => {
    const root = await repo(base);
    await age(root, ".ori/scenarios/s1/review.md");
    await rm(join(root, ".ori/scenarios/s1/tests/s1.spec.ts"));
    run(root);
    expect(await dirty(root, ".ori/scenarios/s1")).toEqual([
      expect.objectContaining({ affected_phase: "review" }),
    ]);
  });

  it("--file on a scenario test marks the scenario for review", async () => {
    const root = await repo(base);
    await age(root, ".ori/scenarios/s1/review.md");
    run(root, ["--file", ".ori/scenarios/s1/tests/s1.spec.ts"]);
    expect(await dirty(root, ".ori/scenarios/s1")).toEqual([
      expect.objectContaining({ affected_phase: "review" }),
    ]);
  });
});

describe("status.yaml / manifest.yaml handling", () => {
  it("keeps comments and other keys' formatting when appending dirty (ori-o3nu)", async () => {
    const status = "# ledger — do not edit\nslice_id: a\ntags: [x, y] # inline\ndirty: []\n";
    const root = await repo({
      ".ori/domain/validation.md": DOMAIN,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/validation.md#s2\n",
      ".ori/slices/a/status.yaml": status,
    });
    await write(root, { ".ori/domain/validation.md": DOMAIN.replace("s2 body", "s2 body v2") });
    run(root);
    const after = await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8");
    expect(after).toContain("# ledger — do not edit");
    expect(after).toContain("tags: [ x, y ] # inline");
    expect(yamlParse(after).dirty).toHaveLength(1);
  });

  it("does not rewrite status.yaml when nothing new is added", async () => {
    const root = await repo({
      ".ori/domain/validation.md": DOMAIN,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/validation.md#s1\n",
      ".ori/slices/a/status.yaml": "dirty:   []   # keep\n",
    });
    await write(root, { ".ori/domain/validation.md": DOMAIN.replace("s2 body", "s2 body v2") });
    run(root);
    expect(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8")).toBe("dirty:   []   # keep\n");
  });

  it("reports an invalid manifest.yaml with its position and exits 1 (ori-5qrc)", async () => {
    const root = await repo({
      ".ori/domain/validation.md": DOMAIN,
      ".ori/slices/broken/manifest.yaml": "derives_from:\n  - domain/validation.md#s2\n bad: [\n",
      ".ori/slices/broken/status.yaml": CLEAN,
      ".ori/slices/ok/manifest.yaml": "derives_from:\n  - domain/validation.md#s2\n",
      ".ori/slices/ok/status.yaml": CLEAN,
    });
    await write(root, { ".ori/domain/validation.md": DOMAIN.replace("s2 body", "s2 body v2") });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/\.ori\/slices\/broken\/manifest\.yaml:\d+:\d+/);
    expect(await dirty(root, ".ori/slices/ok")).toHaveLength(1);

    const c = run(root, ["--check", "--since", "HEAD"]);
    expect(c.code).toBe(1);
    expect(c.out).toContain(".ori/slices/broken/manifest.yaml");
  });
});

describe("PR #138 review follow-ups", () => {
  const slice = (ref: string) => ({
    ".ori/slices/a/manifest.yaml": `derives_from:\n  - ${ref}\n`,
    ".ori/slices/a/status.yaml": CLEAN,
  });

  it("falls back to file level when the frontmatter is invalid, without aborting (S1)", async () => {
    const broken = "---\ntitle: [unclosed\n---\n" + DOMAIN;
    const root = await repo({
      ".ori/domain/validation.md": broken,
      ".ori/domain/other.md": DOMAIN,
      ...slice("domain/validation.md#s1"),
      ".ori/slices/b/manifest.yaml": "derives_from:\n  - domain/other.md#s2\n",
      ".ori/slices/b/status.yaml": CLEAN,
    });
    await write(root, {
      ".ori/domain/validation.md": broken.replace("s2 body", "s2 body v2"),
      ".ori/domain/other.md": DOMAIN.replace("s2 body", "s2 body v2"),
    });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(await dirty(root, ".ori/slices/b")).toHaveLength(1);
    // frontmatter は YAML として解釈しない (gray-matter のように throw しない)。前文は不変なので節単位で s1 は不変
    expect(await dirty(root, ".ori/slices/a")).toEqual([]);
  });

  it("marks an H3 ref when the parent H2's own body changes (S3)", async () => {
    const root = await repo({ ".ori/domain/validation.md": DOMAIN, ...slice("domain/validation.md#s1-detail") });
    await write(root, { ".ori/domain/validation.md": DOMAIN.replace("s1 body", "s1 body v2") });
    run(root);
    expect(await dirty(root, ".ori/slices/a")).toHaveLength(1);
  });

  it("does not mark an H3 ref when only a sibling anchored H3 changes", async () => {
    const doc = DOMAIN.replace("## Scenario S2", "### Other {#s1-other}\nother\n\n## Scenario S2");
    const root = await repo({ ".ori/domain/validation.md": doc, ...slice("domain/validation.md#s1-detail") });
    await write(root, { ".ori/domain/validation.md": doc.replace("other\n", "other v2\n") });
    run(root);
    expect(await dirty(root, ".ori/slices/a")).toEqual([]);
  });

  it("matches by file when the frontmatter or the preamble changes (S3)", async () => {
    const withFm = "---\ntitle: v1\n---\n" + DOMAIN.replace("# Validation {#validation}\n", "# Validation {#validation}\nintro\n");
    for (const edit of [(d: string) => d.replace("title: v1", "title: v2"), (d: string) => d.replace("intro", "intro v2")]) {
      const root = await repo({ ".ori/domain/validation.md": withFm, ...slice("domain/validation.md#s2") });
      await write(root, { ".ori/domain/validation.md": edit(withFm) });
      run(root);
      expect(await dirty(root, ".ori/slices/a")).toHaveLength(1);
    }
  });

  const scenario = {
    ".ori/scenarios/s1/manifest.yaml": "type: scenario\nderives_from: []\n",
    ".ori/scenarios/s1/status.yaml": CLEAN,
    ".ori/scenarios/s1/tests/a.spec.ts": "// a\n",
    ".ori/scenarios/s1/tests/b.spec.ts": "// b\n",
  };

  it("does not re-mark a deleted test once the scenario has been reviewed again (S2)", async () => {
    const root = await repo(scenario);
    await rm(join(root, ".ori/scenarios/s1/tests/a.spec.ts"));
    await age(root, ".ori/scenarios/s1/tests"); // 削除 → (1 時間後に) review
    await write(root, { ".ori/scenarios/s1/review.md": "verdict: PASS\n" });
    run(root);
    expect(await dirty(root, ".ori/scenarios/s1")).toEqual([]);
  });

  it("ignores only the runner output dirs directly under tests/ (N5)", async () => {
    const root = await repo({ ...scenario, ".ori/scenarios/s1/review.md": "verdict: PASS\n" });
    await age(root, ".ori/scenarios/s1/review.md");
    const inputs = [
      "tests/__screenshots__/home.png",
      "tests/__snapshots__/a.snap",
      "tests/s1.spec.ts-snapshots/home-chromium-linux.png",
      "tests/localBaseline/home.png",
      "tests/fixtures/avatar.png",
      "tests/fixtures/upload.zip",
      "tests/fixtures/sample.log",
      "tests/logs/helper.ts",
      "tests/coverage/cases.ts",
      "tests/fixtures/test-results/expected.json", // 直下でなければ入力
    ];
    const outputs = [
      "tests/test-results/trace.zip",
      "tests/playwright-report/index.html",
      "tests/allure-results/r.json",
      "tests/.cache/x",
    ];
    await write(root, Object.fromEntries([...inputs, ...outputs].map((f) => [`.ori/scenarios/s1/${f}`, "x"])));
    run(root);
    const marked = (await dirty(root, ".ori/scenarios/s1")).map((d) => d.source.path.replace(".ori/scenarios/s1/", ""));
    expect(marked.sort()).toEqual([...inputs].sort());
  });
});
