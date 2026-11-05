import { execFile, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(
  REPO_ROOT,
  ".apm",
  "skills",
  "ori-derive",
  "scripts",
  "resolve-upstream.sh",
);
const BASH_PATH = execSync("command -v bash", {
  encoding: "utf8",
  shell: "/bin/sh",
}).trim();

async function withFixture(
  files: Record<string, string>,
  manifest: string,
  fn: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), "ori-szx-"));
  try {
    await mkdir(join(projectRoot, ".ori", "slices", "test-slice"), {
      recursive: true,
    });
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(projectRoot, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body, "utf8");
    }
    await writeFile(
      join(projectRoot, ".ori", "slices", "test-slice", "manifest.yaml"),
      manifest,
      "utf8",
    );
    await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function runResolve(
  projectRoot: string,
  sliceId = "test-slice",
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(BASH_PATH, [
    SCRIPT,
    sliceId,
    "--project-root",
    projectRoot,
  ]);
}

describe("ori-derive resolve-upstream.sh (ori-szx)", () => {
  it("parses the structured form (`- path:` / `section:`) as written by ori-3ik retry", async () => {
    const manifest = `slice_id: test-slice
derives_from:
  - path: .ori/domain/bounded-contexts.md
    section: task-management
  - path: .ori/domain/aggregates.md
    section: task-aggregate
implementation:
  language: typescript
`;
    await withFixture(
      {
        ".ori/domain/bounded-contexts.md": "# BCs\n## task-management\nbody\n",
        ".ori/domain/aggregates.md": "# Aggregates\n",
      },
      manifest,
      async (root) => {
        const { stdout, stderr } = await runResolve(root);
        const lines = stdout.trim().split("\n");
        // Two entries, both resolved (hash prefix 12 chars).
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatch(
          /^\.ori\/domain\/bounded-contexts\.md#task-management [0-9a-f]{12}$/,
        );
        expect(lines[1]).toMatch(
          /^\.ori\/domain\/aggregates\.md#task-aggregate [0-9a-f]{12}$/,
        );
        expect(stderr).toBe("");
      },
    );
  });

  it("parses the legacy string form (`- file#section`) used in SKILL.md template", async () => {
    const manifest = `slice_id: test-slice
derives_from:
  - domain/bounded-contexts.md#task-management
  - domain/aggregates.md
`;
    await withFixture(
      {
        ".ori/domain/bounded-contexts.md": "# BCs\n",
        ".ori/domain/aggregates.md": "# Aggregates\n",
      },
      manifest,
      async (root) => {
        const { stdout, stderr } = await runResolve(root);
        const lines = stdout.trim().split("\n");
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatch(
          /^domain\/bounded-contexts\.md#task-management [0-9a-f]{12}$/,
        );
        expect(lines[1]).toMatch(/^domain\/aggregates\.md [0-9a-f]{12}$/);
        expect(stderr).toBe("");
      },
    );
  });

  it("accepts mixed structured + legacy entries within one manifest", async () => {
    const manifest = `slice_id: test-slice
derives_from:
  - domain/x.md#sec
  - path: .ori/domain/y.md
    section: sec2
relations: []
`;
    await withFixture(
      {
        ".ori/domain/x.md": "# X\n",
        ".ori/domain/y.md": "# Y\n",
      },
      manifest,
      async (root) => {
        const { stdout } = await runResolve(root);
        const lines = stdout.trim().split("\n");
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatch(/^domain\/x\.md#sec [0-9a-f]{12}$/);
        expect(lines[1]).toMatch(/^\.ori\/domain\/y\.md#sec2 [0-9a-f]{12}$/);
      },
    );
  });

  it("reports NOT_FOUND on stderr (and exits 0) when an entry's file is missing", async () => {
    const manifest = `slice_id: test-slice
derives_from:
  - domain/exists.md
  - domain/missing.md
`;
    await withFixture(
      { ".ori/domain/exists.md": "# Exists\n" },
      manifest,
      async (root) => {
        const { stdout, stderr } = await runResolve(root);
        const stdoutLines = stdout.trim().split("\n");
        expect(stdoutLines).toHaveLength(1);
        expect(stdoutLines[0]).toMatch(/^domain\/exists\.md [0-9a-f]{12}$/);
        expect(stderr).toMatch(/domain\/missing\.md NOT_FOUND/);
      },
    );
  });

  it("emits nothing for an empty derives_from", async () => {
    const manifest = `slice_id: test-slice
derives_from: []
implementation:
  language: typescript
`;
    await withFixture({}, manifest, async (root) => {
      const { stdout, stderr } = await runResolve(root);
      expect(stdout.trim()).toBe("");
      expect(stderr).toBe("");
    });
  });

  it("supports --manifest to point at an arbitrary file without a slice-id lookup", async () => {
    const manifest = `derives_from:
  - other.md
`;
    const projectRoot = await mkdtemp(join(tmpdir(), "ori-szx-"));
    try {
      await mkdir(join(projectRoot, ".ori"), { recursive: true });
      await writeFile(join(projectRoot, ".ori", "other.md"), "# Other\n", "utf8");
      const altManifest = join(projectRoot, "alt-manifest.yaml");
      await writeFile(altManifest, manifest, "utf8");
      const { stdout } = await execFileAsync(BASH_PATH, [
        SCRIPT,
        "--manifest",
        altManifest,
        "--project-root",
        projectRoot,
      ]);
      expect(stdout.trim()).toMatch(/^other\.md [0-9a-f]{12}$/);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

// 暫定 --coherence モード (ori-0eh): SSoT 形式 (feature-spec.instructions.md §coherence-frontmatter)
// の coherence ブロックを出力する。ori-0eh.4 で write-spec-hash に置換するまでの hash 記録経路。
describe("ori-derive resolve-upstream.sh --coherence (ori-0eh interim)", () => {
  const sha12 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

  async function runCoherence(projectRoot: string, id: string) {
    return execFileAsync(BASH_PATH, [SCRIPT, id, "--project-root", projectRoot, "--coherence"]);
  }

  it("emits upstream refs (.ori/ stripped, deduped) and a file-keyed hash map", async () => {
    const manifest = `slice_id: test-slice
derives_from:
  - domain/aggregates.md#note-aggregate
  - path: .ori/domain/aggregates.md
    section: tag-aggregate
  - .ori/domain/aggregates.md#note-aggregate
  - domain/workflows.md
`;
    await withFixture(
      { ".ori/domain/aggregates.md": "# Agg\n", ".ori/domain/workflows.md": "# Wf\n" },
      manifest,
      async (root) => {
        const { stdout } = await runCoherence(root, "test-slice");
        const today = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        expect(stdout).toBe(`coherence:
  source: derived
  last_derived: ${date}
  upstream:
    - domain/aggregates.md#note-aggregate
    - domain/aggregates.md#tag-aggregate
    - domain/workflows.md
  hash:
    domain/aggregates.md: ${sha12("# Agg\n")}
    domain/workflows.md: ${sha12("# Wf\n")}
`);
      },
    );
  });

  it("exits 1 and prints no block when an upstream file is missing", async () => {
    await withFixture({}, "derives_from:\n  - domain/missing.md\n", async (root) => {
      const err = await runCoherence(root, "test-slice").catch((e) => e);
      expect(err.code).toBe(1);
      expect(err.stdout).toBe("");
      expect(err.stderr).toContain("domain/missing.md NOT_FOUND");
    });
  });

  it("resolves page manifests (.ori/pages/<id>/)", async () => {
    const root = await mkdtemp(join(tmpdir(), "ori-0eh-"));
    try {
      await mkdir(join(root, ".ori", "pages", "p1"), { recursive: true });
      await mkdir(join(root, ".ori", "domain"), { recursive: true });
      await writeFile(join(root, ".ori", "domain", "screens.md"), "s\n", "utf8");
      await writeFile(
        join(root, ".ori", "pages", "p1", "manifest.yaml"),
        "page_id: p1\ntype: page\nderives_from:\n  - domain/screens.md#screen-1\n",
        "utf8",
      );
      const { stdout } = await runCoherence(root, "p1");
      expect(stdout).toContain(`    domain/screens.md: ${sha12("s\n")}\n`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
