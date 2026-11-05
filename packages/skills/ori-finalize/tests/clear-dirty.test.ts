import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
// build-skills の出力 (skill に同梱される bundle) を実行する
const SCRIPT = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-finalize", "scripts", "clear-dirty.js");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ori-clear-dirty-"));
  tmpDirs.push(root);
  await mkdir(join(root, ".ori"), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
  return root;
}

function run(root: string, args: string[]) {
  const r = spawnSync("node", [SCRIPT, ...args], { cwd: root, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

// /ori-sync (yaml.stringify) が書く block style の dirty
const DIRTY_STATUS = `slice_id: create-note
# 手書きのコメントは残る
dirty:
  - source:
      path: .ori/domain/aggregates.md
      sectionId: note-aggregate
    detected_at: 2026-06-01T00:00:00.000Z
    affected_phase: derive
    reason: edit
  - source:
      path: .ori/domain/types.md
      sectionId: null
    detected_at: 2026-06-01T00:00:00.000Z
    affected_phase: derive
    reason: edit
finalized_at: 2026-06-30
notes: "spec: updated"
`;
const PASS = "## Pass 1\n\nverdict: PASS\n";

describe("clear-dirty.js", () => {
  it("clears a block-style dirty list into valid YAML and keeps the other keys (GitHub #133)", async () => {
    const root = await fixture({
      ".ori/slices/create-note/status.yaml": DIRTY_STATUS,
      ".ori/slices/create-note/review.md": PASS,
    });
    const r = run(root, ["create-note"]);
    expect(r.out).toContain("cleared 2 dirty mark(s) for slice create-note");
    expect(r.code).toBe(0);
    const raw = await readFile(join(root, ".ori/slices/create-note/status.yaml"), "utf8");
    expect(yamlParse(raw)).toEqual({
      slice_id: "create-note",
      dirty: [],
      finalized_at: "2026-06-30",
      notes: "spec: updated",
    });
    expect(raw).toContain("# 手書きのコメントは残る");
    expect(raw).not.toContain("aggregates.md");
  });

  it.each([
    ["page", ".ori/pages/page-main"],
    ["scenario", ".ori/scenarios/s1"],
  ])("handles %s status.yaml (ori-r5b8)", async (kind, dir) => {
    const id = dir.split("/").at(-1)!;
    const root = await fixture({
      [`${dir}/status.yaml`]: DIRTY_STATUS.replace("slice_id: create-note", `${kind}_id: ${id}`),
      [`${dir}/review.md`]: PASS,
    });
    const r = run(root, [id]);
    expect(r.out).toContain(`cleared 2 dirty mark(s) for ${kind} ${id}`);
    expect(r.code).toBe(0);
    expect(yamlParse(await readFile(join(root, dir, "status.yaml"), "utf8")).dirty).toEqual([]);
  });

  it("requires --kind when the id exists under more than one kind", async () => {
    const root = await fixture({
      ".ori/slices/x/status.yaml": DIRTY_STATUS,
      ".ori/slices/x/review.md": PASS,
      ".ori/pages/x/status.yaml": DIRTY_STATUS,
      ".ori/pages/x/review.md": PASS,
    });
    const ambiguous = run(root, ["x"]);
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.out).toContain("--kind");

    const r = run(root, ["x", "--kind", "page"]);
    expect(r.code).toBe(0);
    expect(yamlParse(await readFile(join(root, ".ori/pages/x/status.yaml"), "utf8")).dirty).toEqual([]);
    expect(yamlParse(await readFile(join(root, ".ori/slices/x/status.yaml"), "utf8")).dirty).toHaveLength(2);
  });

  it("refuses without review.md, or with a non-PASS last verdict, and leaves status.yaml untouched", async () => {
    const root = await fixture({
      ".ori/slices/a/status.yaml": DIRTY_STATUS,
      ".ori/pages/b/status.yaml": DIRTY_STATUS,
      ".ori/pages/b/review.md": "verdict: PASS\n\n## Pass 2\n\nverdict: NEEDS_FIX\n",
    });
    const noReview = run(root, ["a"]);
    expect(noReview.code).toBe(1);
    expect(noReview.out).toContain("review.md does not exist");

    const needsFix = run(root, ["b"]);
    expect(needsFix.code).toBe(1);
    expect(needsFix.out).toContain("'NEEDS_FIX'");

    expect(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8")).toBe(DIRTY_STATUS);
    expect(await readFile(join(root, ".ori/pages/b/status.yaml"), "utf8")).toBe(DIRTY_STATUS);
  });

  it("--skip-review-check bypasses the gate (also accepted as the 2nd positional, as before)", async () => {
    const root = await fixture({ ".ori/slices/a/status.yaml": DIRTY_STATUS });
    const r = run(root, ["a", "--skip-review-check"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("review gate");
  });

  it("does not touch an already-invalid status.yaml and points at the broken line", async () => {
    // 旧 sed 版 clear-dirty.sh が残した形
    const broken = "slice_id: a\ndirty: []\n  - source:\n      path: .ori/domain/x.md\nfinalized_at: 2026-06-30\n";
    const root = await fixture({
      ".ori/slices/a/status.yaml": broken,
      ".ori/slices/a/review.md": PASS,
    });
    const r = run(root, ["a"]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/\.ori\/slices\/a\/status\.yaml:\d+:\d+/);
    expect(r.out).not.toMatch(/at .*\.js:\d+/);
    expect(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8")).toBe(broken);
  });

  it("is idempotent on an already-empty dirty", async () => {
    const root = await fixture({
      ".ori/slices/a/status.yaml": "slice_id: a\ndirty: []\n",
      ".ori/slices/a/review.md": PASS,
    });
    const r = run(root, ["a"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("cleared 0 dirty mark(s)");
    expect(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8")).toBe("slice_id: a\ndirty: []\n");
  });

  it("does not accept a verdict split across lines (`verdict:` / `PASS` on the next line)", async () => {
    const root = await fixture({
      ".ori/slices/a/status.yaml": DIRTY_STATUS,
      ".ori/slices/a/review.md": "## Pass 1\n\nverdict:\nPASS\n",
    });
    const r = run(root, ["a"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("no verdict found");
    expect(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8")).toBe(DIRTY_STATUS);
  });

  it("adds `dirty: []` when the key is missing", async () => {
    const root = await fixture({
      ".ori/slices/a/status.yaml": "slice_id: a\nfinalized_at: 2026-06-30\n",
      ".ori/slices/a/review.md": PASS,
    });
    const r = run(root, ["a"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("cleared 0 dirty mark(s)");
    expect(yamlParse(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8"))).toEqual({
      slice_id: "a",
      finalized_at: "2026-06-30",
      dirty: [],
    });
  });

  it("refuses a status.yaml whose top level is not a mapping, leaving it untouched", async () => {
    const body = "- slice_id: a\n- dirty: []\n";
    const root = await fixture({ ".ori/slices/a/status.yaml": body, ".ori/slices/a/review.md": PASS });
    const r = run(root, ["a"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("top level must be a mapping");
    expect(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8")).toBe(body);
  });

  it("fails when --kind points at a kind without that id", async () => {
    const root = await fixture({ ".ori/slices/a/status.yaml": DIRTY_STATUS, ".ori/slices/a/review.md": PASS });
    const r = run(root, ["a", "--kind", "page"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(".ori/pages/a/status.yaml not found");
    expect(await readFile(join(root, ".ori/slices/a/status.yaml"), "utf8")).toBe(DIRTY_STATUS);
  });

  it("keeps the file mode, leaves no temp file, and does not reformat unrelated flow collections", async () => {
    const body = `slice_id: a\nbeads: {epic: ori-x, completion: [derive, plan]}\n${DIRTY_STATUS.slice("slice_id: create-note\n".length)}`;
    const root = await fixture({ ".ori/slices/a/status.yaml": body, ".ori/slices/a/review.md": PASS });
    const statusPath = join(root, ".ori/slices/a/status.yaml");
    await chmod(statusPath, 0o640);
    const r = run(root, ["a"]);
    expect(r.code).toBe(0);
    expect((await stat(statusPath)).mode & 0o777).toBe(0o640);
    expect(await readdir(join(root, ".ori/slices/a"))).toEqual(["review.md", "status.yaml"]);
    expect(await readFile(statusPath, "utf8")).toContain("beads: {epic: ori-x, completion: [derive, plan]}\n");
  });
});
