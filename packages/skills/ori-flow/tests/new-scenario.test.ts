import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(REPO_ROOT, ".apm", "skills", "ori-flow", "scripts", "new-scenario.js");

const VALIDATION_MD = `---
ori:
  node_id: scenario:collection
  type: scenario
---

# Validation Scenarios {#validation-scenarios}

## Scenario S1: Note created happy {#s1-note-created-happy}

### Given {#s1-note-created-happy-given}

- 新規ユーザ

### When {#s1-note-created-happy-when}

- \`CreateNoteCommand{ body: "hello" }\`

### Then {#s1-note-created-happy-then}

- event \`NoteCreated\` 発行

## Scenario S2: Tag filter narrow {#s2-tag-filter-narrow}

### Given {#s2-tag-filter-narrow-given}

- Note 2 件 (tag=a, tag=b)

### When {#s2-tag-filter-narrow-when}

- filter by tag a

### Then {#s2-tag-filter-narrow-then}

- 1 件表示
`;

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

async function withFixture(
  files: Record<string, string>,
  fn: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), "ori-new-scenario-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(projectRoot, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body, "utf8");
    }
    await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

const MINIMAL_MANIFEST = "scenario_id: smoke\ntype: scenario\nderives_from: []\n";

describe("new-scenario --list-validation", () => {
  it("exits 1 with guidance when .ori/domain/validation.md is missing", async () => {
    await withFixture({}, async (root) => {
      const r = await run(["--list-validation"], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain(".ori/domain/validation.md not found");
    });
  });

  it("lists section anchors with scaffold coverage and orphan scenarios", async () => {
    await withFixture(
      {
        ".ori/domain/validation.md": VALIDATION_MD,
        ".ori/scenarios/s1-note-created-happy/manifest.yaml": MINIMAL_MANIFEST,
        ".ori/scenarios/legacy-orphan/manifest.yaml": MINIMAL_MANIFEST,
      },
      async (root) => {
        const r = await run(["--list-validation"], root);
        expect(r.code).toBe(0);
        expect(r.all).toContain("s1-note-created-happy");
        expect(r.all).toContain("s2-tag-filter-narrow");
        // H1 / H3 anchors must not be listed as scenario sections
        expect(r.all).not.toContain("validation-scenarios\n");
        expect(r.all).not.toContain("s1-note-created-happy-given");
        expect(r.all).toContain("scaffolded");
        expect(r.all).toContain("candidate");
        expect(r.all).toContain("coverage: 1/2");
        expect(r.all).toContain("legacy-orphan");
      },
    );
  });

  it("warns when validation.md has no `## Scenario ... {#anchor}` sections", async () => {
    await withFixture(
      { ".ori/domain/validation.md": "# Validation Scenarios {#validation-scenarios}\n\nnothing here\n" },
      async (root) => {
        const r = await run(["--list-validation"], root);
        expect(r.code).toBe(0);
        expect(r.all).toContain("No `## Scenario ... {#anchor}` sections");
      },
    );
  });
});

describe("new-scenario <id> (1:1 anchor guard)", () => {
  it("scaffolds a scenario whose id matches a validation section anchor", async () => {
    await withFixture({ ".ori/domain/validation.md": VALIDATION_MD }, async (root) => {
      const r = await run(["s2-tag-filter-narrow"], root);
      expect(r.code).toBe(0);

      const manifest = await readFile(
        join(root, ".ori/scenarios/s2-tag-filter-narrow/manifest.yaml"),
        "utf8",
      );
      expect(manifest).toContain('scenario_id: "s2-tag-filter-narrow"');
      expect(manifest).toContain("- domain/validation.md#s2-tag-filter-narrow");
      // R5: slice-oriented fields must not leak into scenario manifests
      expect(manifest).not.toContain("relations:");
      expect(manifest).not.toContain("implementation:");
      expect(manifest).not.toContain("{{");

      const spec = await readFile(
        join(root, ".ori/scenarios/s2-tag-filter-narrow/spec.md"),
        "utf8",
      );
      expect(spec).toContain("domain/validation.md#s2-tag-filter-narrow");

      for (const f of ["notes.md", "status.yaml"]) {
        await expect(
          readFile(join(root, ".ori/scenarios/s2-tag-filter-narrow", f), "utf8"),
        ).resolves.toContain("s2-tag-filter-narrow");
      }
    });
  });

  it("exits 1 when the id matches no validation section anchor", async () => {
    await withFixture({ ".ori/domain/validation.md": VALIDATION_MD }, async (root) => {
      const r = await run(["note-crud"], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain("not found in .ori/domain/validation.md");
      expect(r.all).toContain("--list-validation");
    });
  });

  it("exits 1 when .ori/domain/validation.md is missing", async () => {
    await withFixture({}, async (root) => {
      const r = await run(["s1-note-created-happy"], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain(".ori/domain/validation.md not found");
      // nothing must be created
      await expect(
        readFile(join(root, ".ori/scenarios/s1-note-created-happy/manifest.yaml"), "utf8"),
      ).rejects.toThrow();
    });
  });

  it("exits 1 when the scenario is already scaffolded", async () => {
    await withFixture(
      {
        ".ori/domain/validation.md": VALIDATION_MD,
        ".ori/scenarios/s1-note-created-happy/manifest.yaml": MINIMAL_MANIFEST,
      },
      async (root) => {
        const r = await run(["s1-note-created-happy"], root);
        expect(r.code).toBe(1);
        expect(r.all).toContain("Scenario already exists");
      },
    );
  });

  it("exits 1 on non-kebab ids", async () => {
    await withFixture({ ".ori/domain/validation.md": VALIDATION_MD }, async (root) => {
      const r = await run(["NoteCrud"], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain("Usage");
    });
  });
});
