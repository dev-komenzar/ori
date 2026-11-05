import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// write-spec-hash (ori-0eh.3): build 済み bundle を実行して CLI の契約 (exit code / 出力 / 書き込み) を検証する
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-derive", "scripts", "write-spec-hash.js");

const sha12 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const AGG = "# Aggregates\n\n## Note {#note-aggregate}\n\n## Tag {#tag-aggregate}\n";
const WF = "# Workflows\n";

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ori-wsh-"));
  tmpDirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
  return root;
}

function run(root: string, args: string[]) {
  const r = spawnSync("node", [CLI, ...args], { cwd: root, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const read = (root: string, rel: string) => readFile(join(root, rel), "utf8");

const BODY = "\n# s1 — Slice Specification\n\n## 概要 {#overview}\n\nbody text\n";

function spec(coherence: string, extra = "title: S1\n"): string {
  return `---\n${extra}${coherence}---\n${BODY}`;
}

const MANIFEST = `slice_id: s1
type: slice
derives_from:
  - domain/aggregates.md#note-aggregate
  - path: .ori/domain/aggregates.md
    section: tag-aggregate
  - .ori/domain/workflows.md
`;

const EXPECTED_BLOCK = (date: string, agg = sha12(AGG), wf = sha12(WF)) => `coherence:
  source: derived
  last_derived: ${date}
  upstream:
    - domain/aggregates.md#note-aggregate
    - domain/aggregates.md#tag-aggregate
    - domain/workflows.md
  hash:
    domain/aggregates.md: ${agg}
    domain/workflows.md: ${wf}
`;

describe("write-spec-hash default (derive)", () => {
  it("regenerates a hash-only spec into the SSoT form (upstream + file-keyed hash), keeping other keys and body", async () => {
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/domain/workflows.md": WF,
      ".ori/slices/s1/manifest.yaml": MANIFEST,
      ".ori/slices/s1/spec.md": spec(
        "coherence:\n  source: derived\n  hash:\n    domain/aggregates.md#.*: 000000000000\n    domain/stale.md: 111111111111\n",
      ),
    });
    const r = run(root, ["slice/s1"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("slices/s1: updated (3 upstream ref(s), 2 hash key(s))");
    expect(r.stdout).toContain("removed key(s) outside derives_from: domain/stale.md");
    expect(r.stdout).toContain("1 updated, 0 unchanged, 0 failed");
    expect(await read(root, ".ori/slices/s1/spec.md")).toBe(spec(EXPECTED_BLOCK(TODAY)));
  });

  it("regenerates an upstream+hash spec and defaults kind to slice; re-run is a no-op", async () => {
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/domain/workflows.md": WF,
      ".ori/slices/s1/manifest.yaml": MANIFEST,
      ".ori/slices/s1/spec.md": spec(
        "coherence:\n  source: derived\n  last_derived: 2026-01-01\n  upstream:\n    - domain/old.md\n  hash:\n    domain/old.md: 222222222222\n",
      ),
    });
    const first = run(root, ["s1"]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("removed upstream ref(s) outside derives_from: domain/old.md");
    expect(await read(root, ".ori/slices/s1/spec.md")).toBe(spec(EXPECTED_BLOCK(TODAY)));
    const again = run(root, ["s1"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("0 updated, 1 unchanged, 0 failed");
  });

  it("writes scenario specs (legacy {path, hash} upstream) and page specs", async () => {
    const root = await project({
      ".ori/domain/workflows.md": WF,
      ".ori/scenarios/sc1/manifest.yaml": "scenario_id: sc1\ntype: scenario\nderives_from:\n  - domain/workflows.md#order\n",
      ".ori/scenarios/sc1/spec.md": spec(
        "coherence:\n  source: derived\n  upstream:\n    - path: domain/workflows.md#order\n      hash: abc123\n",
        "",
      ),
      ".ori/pages/p1/manifest.yaml": "page_id: p1\ntype: page\nderives_from:\n  - domain/workflows.md\n",
      ".ori/pages/p1/spec.md": spec("coherence:\n  source: derived\n  upstream: []\n  hash: {}\n", ""),
    });
    expect(run(root, ["scenario/sc1"]).code).toBe(0);
    expect(await read(root, ".ori/scenarios/sc1/spec.md")).toBe(
      spec(
        `coherence:\n  source: derived\n  last_derived: ${TODAY}\n  upstream:\n    - domain/workflows.md#order\n  hash:\n    domain/workflows.md: ${sha12(WF)}\n`,
        "",
      ),
    );
    expect(run(root, ["page/p1"]).code).toBe(0);
    expect(await read(root, ".ori/pages/p1/spec.md")).toContain(`    domain/workflows.md: ${sha12(WF)}\n`);
  });

  it("exits non-zero when derives_from has 0 entries (no-op is not success)", async () => {
    const root = await project({
      ".ori/slices/s1/manifest.yaml": "slice_id: s1\nderives_from: []\n",
      ".ori/slices/s1/spec.md": spec("coherence:\n  source: derived\n  upstream: []\n  hash: {}\n"),
    });
    const r = run(root, ["slice/s1"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no derives_from entries");
    expect(r.stdout).toContain("0 updated, 0 unchanged, 1 failed");
  });

  it("exits non-zero and leaves spec.md untouched when an upstream file is missing", async () => {
    const original = spec("coherence:\n  source: derived\n  upstream: []\n  hash: {}\n");
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/slices/s1/manifest.yaml": "derives_from:\n  - domain/aggregates.md\n  - domain/missing.md#x\n",
      ".ori/slices/s1/spec.md": original,
    });
    const r = run(root, ["slice/s1"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("upstream file(s) not found: domain/missing.md");
    expect(await read(root, ".ori/slices/s1/spec.md")).toBe(original);
  });

  it("exits non-zero when manifest or spec.md is missing, hinting the right kind", async () => {
    const root = await project({
      ".ori/domain/workflows.md": WF,
      ".ori/pages/p1/manifest.yaml": "derives_from:\n  - domain/workflows.md\n",
    });
    const wrongKind = run(root, ["p1"]);
    expect(wrongKind.code).toBe(1);
    expect(wrongKind.stderr).toContain("pass page/p1");
    const noSpec = run(root, ["page/p1"]);
    expect(noSpec.code).toBe(1);
    expect(noSpec.stderr).toContain("spec.md not found");
  });

  it("--dry-run prints the refs and hashes without spec.md and without writing", async () => {
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/domain/workflows.md": WF,
      ".ori/slices/s1/manifest.yaml": MANIFEST,
    });
    const r = run(root, ["slice/s1", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      [
        "slices/s1: would write 3 upstream ref(s), 2 hash key(s)",
        "upstream:",
        "  - domain/aggregates.md#note-aggregate",
        "  - domain/aggregates.md#tag-aggregate",
        "  - domain/workflows.md",
        "hash:",
        `  domain/aggregates.md: ${sha12(AGG)}`,
        `  domain/workflows.md: ${sha12(WF)}`,
        "",
      ].join("\n"),
    );
  });

  it("rejects usage errors with exit 2", async () => {
    const root = await project({ ".ori/slices/s1/manifest.yaml": MANIFEST });
    expect(run(root, []).code).toBe(2);
    expect(run(root, ["s1", "--accept", "--migrate"]).code).toBe(2);
    expect(run(root, ["--all"]).code).toBe(2);
    expect(run(root, ["--all", "--accept"]).code).toBe(2);
    expect(run(root, ["widget/s1"]).code).toBe(2);
    expect(run(root, ["s1", "--bogus"]).code).toBe(2);
  });
});

describe("write-spec-hash --migrate", () => {
  it("normalizes legacy keys to file paths and keeps recorded values (does not re-hash)", async () => {
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/domain/workflows.md": WF,
      ".ori/slices/s1/manifest.yaml": MANIFEST,
      // `#.*` 潰れの重複キー (値一致) + `#anchor` キー + derives_from 外のキー
      ".ori/slices/s1/spec.md": spec(
        "coherence:\n  source: derived\n  last_derived: 2026-01-01\n  hash:\n    domain/aggregates.md#.*: aaaaaaaaaaaa\n    domain/aggregates.md#.*: aaaaaaaaaaaa\n    .ori/domain/workflows.md#top: bbbbbbbbbbbb\n    domain/gone.md: cccccccccccc\n",
      ),
    });
    const r = run(root, ["slice/s1", "--migrate"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("removed key(s) outside derives_from: domain/gone.md");
    expect(await read(root, ".ori/slices/s1/spec.md")).toBe(
      spec(EXPECTED_BLOCK("2026-01-01", "aaaaaaaaaaaa", "bbbbbbbbbbbb")),
    );
  });

  it("stops without writing when recorded values disagree for the same file", async () => {
    const original = spec(
      "coherence:\n  source: derived\n  hash:\n    domain/aggregates.md#note-aggregate: aaaaaaaaaaaa\n    domain/aggregates.md#tag-aggregate: dddddddddddd\n    domain/workflows.md: bbbbbbbbbbbb\n",
    );
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/domain/workflows.md": WF,
      ".ori/slices/s1/manifest.yaml": MANIFEST,
      ".ori/slices/s1/spec.md": original,
    });
    const r = run(root, ["slice/s1", "--migrate"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("recorded hash values disagree");
    expect(r.stderr).toContain("domain/aggregates.md#note-aggregate=aaaaaaaaaaaa");
    expect(r.stderr).toContain("domain/aggregates.md#tag-aggregate=dddddddddddd");
    expect(await read(root, ".ori/slices/s1/spec.md")).toBe(original);
  });

  it("stops when an upstream file has no recorded value (points to --accept)", async () => {
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/domain/workflows.md": WF,
      ".ori/slices/s1/manifest.yaml": MANIFEST,
      ".ori/slices/s1/spec.md": spec("coherence:\n  source: derived\n  hash:\n    domain/aggregates.md: aaaaaaaaaaaa\n"),
    });
    const r = run(root, ["slice/s1", "--migrate"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no recorded hash for upstream file(s): domain/workflows.md");
    expect(r.stderr).toContain("--accept");
  });

  it("--all migrates every spec, skips underived targets, and fails if any target fails", async () => {
    const root = await project({
      ".ori/domain/workflows.md": WF,
      ".ori/slices/a/manifest.yaml": "derives_from:\n  - domain/workflows.md\n",
      ".ori/slices/a/spec.md": spec("coherence:\n  source: derived\n  hash:\n    domain/workflows.md#.*: 012345678901\n"),
      ".ori/scenarios/c/manifest.yaml": "derives_from:\n  - domain/workflows.md#flow\n",
      ".ori/scenarios/c/spec.md": spec(
        "coherence:\n  source: derived\n  upstream:\n    - path: domain/workflows.md#flow\n      hash: 3333333333ab\n",
      ),
      // spec.md 未生成 → 対象外
      ".ori/pages/p/manifest.yaml": "derives_from:\n  - domain/workflows.md\n",
    });
    const ok = run(root, ["--all", "--migrate"]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("2 updated, 0 unchanged, 0 failed");
    expect(await read(root, ".ori/slices/a/spec.md")).toContain('    domain/workflows.md: "012345678901"\n');
    expect(await read(root, ".ori/scenarios/c/spec.md")).toContain(
      "  upstream:\n    - domain/workflows.md#flow\n  hash:\n    domain/workflows.md: 3333333333ab\n",
    );

    await mkdir(join(root, ".ori/slices/b"), { recursive: true });
    await writeFile(join(root, ".ori/slices/b/manifest.yaml"), "derives_from: []\n");
    await writeFile(join(root, ".ori/slices/b/spec.md"), spec("coherence:\n  source: derived\n"));
    const bad = run(root, ["--all", "--migrate"]);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("0 updated, 2 unchanged, 1 failed");
  });
});

describe("write-spec-hash input errors", () => {
  it("--migrate also exits non-zero when an upstream file is missing (even with a recorded value)", async () => {
    const original = spec("coherence:\n  source: derived\n  hash:\n    domain/gone.md#.*: aaaaaaaaaaaa\n");
    const root = await project({
      ".ori/slices/s1/manifest.yaml": "derives_from:\n  - domain/gone.md\n",
      ".ori/slices/s1/spec.md": original,
    });
    const r = run(root, ["slice/s1", "--migrate"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("upstream file(s) not found: domain/gone.md");
    expect(await read(root, ".ori/slices/s1/spec.md")).toBe(original);
  });

  it("reports invalid manifest YAML as a target failure and keeps processing --all", async () => {
    const root = await project({
      ".ori/domain/workflows.md": WF,
      ".ori/slices/a/manifest.yaml": "derives_from: [domain/workflows.md\n",
      ".ori/slices/a/spec.md": spec("coherence:\n  source: derived\n"),
      ".ori/slices/b/manifest.yaml": "derives_from:\n  - domain/workflows.md\n",
      ".ori/slices/b/spec.md": spec("coherence:\n  source: derived\n  hash:\n    domain/workflows.md#.*: 1111111111ab\n"),
    });
    const r = run(root, ["--all", "--migrate"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("slices/a: .ori/slices/a/manifest.yaml: invalid YAML");
    expect(r.stderr).not.toContain("    at ");
    expect(r.stdout).toContain("1 updated, 0 unchanged, 1 failed");
  });

  it("refuses unclosed or malformed spec frontmatter without writing", async () => {
    const unclosed = "---\ntitle: S1\n# body\n";
    const malformed = spec("coherence:\n  source: derived\n", "title: [x\n");
    const root = await project({
      ".ori/domain/workflows.md": WF,
      ".ori/slices/u/manifest.yaml": "derives_from:\n  - domain/workflows.md\n",
      ".ori/slices/u/spec.md": unclosed,
      ".ori/slices/m/manifest.yaml": "derives_from:\n  - domain/workflows.md\n",
      ".ori/slices/m/spec.md": malformed,
    });
    const u = run(root, ["slice/u"]);
    expect(u.code).toBe(1);
    expect(u.stderr).toContain("frontmatter is not closed");
    expect(await read(root, ".ori/slices/u/spec.md")).toBe(unclosed);
    const m = run(root, ["slice/m"]);
    expect(m.code).toBe(1);
    expect(m.stderr).toContain("invalid frontmatter YAML");
    expect(await read(root, ".ori/slices/m/spec.md")).toBe(malformed);
  });
});

describe("write-spec-hash --accept", () => {
  it("re-baselines drifted hashes to the current value and keeps last_derived", async () => {
    const root = await project({
      ".ori/domain/aggregates.md": AGG,
      ".ori/domain/workflows.md": WF,
      ".ori/slices/s1/manifest.yaml": MANIFEST,
      ".ori/slices/s1/spec.md": spec(EXPECTED_BLOCK("2026-01-01", "aaaaaaaaaaaa")),
    });
    const r = run(root, ["slice/s1", "--accept"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`accepted domain/aggregates.md: aaaaaaaaaaaa -> ${sha12(AGG)}`);
    expect(r.stdout).not.toContain("accepted domain/workflows.md");
    expect(await read(root, ".ori/slices/s1/spec.md")).toBe(spec(EXPECTED_BLOCK("2026-01-01")));
  });

  it("exits non-zero when an upstream file is missing", async () => {
    const root = await project({
      ".ori/slices/s1/manifest.yaml": "derives_from:\n  - domain/missing.md\n",
      ".ori/slices/s1/spec.md": spec("coherence:\n  source: derived\n"),
    });
    expect(run(root, ["slice/s1", "--accept"]).code).toBe(1);
  });
});
