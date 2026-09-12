import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(REPO_ROOT, ".apm", "skills", "ori-flow", "scripts", "scenario-status.js");

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
  const projectRoot = await mkdtemp(join(tmpdir(), "ori-scenario-status-"));
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

function freshStatus(id: string): string {
  return yamlStringify({
    scenario_id: id,
    derived_at: new Date().toISOString(),
    beads: { epic: `ori-scenario-${id}`, current_phase: null, completion: [] },
    phases: {},
    dirty: [],
  });
}

async function readStatus(root: string, id: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(root, ".ori", "scenarios", id, "status.yaml"), "utf8");
  return (yamlParse(raw) ?? {}) as Record<string, unknown>;
}

describe("scenario-status set", () => {
  it("set derive done on fresh scaffold → phases.derive.state === done, completion contains derive", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "derive", "done"], root);
        expect(r.code).toBe(0);

        const status = await readStatus(root, "s1");
        const phases = status.phases as Record<string, Record<string, unknown>>;
        expect(phases.derive?.state).toBe("done");
        expect(phases.derive?.started_at).toBeTruthy();
        expect(phases.derive?.completed_at).toBeTruthy();

        const beads = status.beads as Record<string, unknown>;
        expect(beads.completion).toEqual(["derive"]);
      },
    );
  });

  it("set derive closed alias behaves like done", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "derive", "closed"], root);
        expect(r.code).toBe(0);

        const status = await readStatus(root, "s1");
        const phases = status.phases as Record<string, Record<string, unknown>>;
        expect(phases.derive?.state).toBe("done");
        expect(phases.derive?.completed_at).toBeTruthy();
      },
    );
  });

  it("idempotent: running done twice does not duplicate completion or change completed_at", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        // first run
        const r1 = await run(["set", "s1", "derive", "done"], root);
        expect(r1.code).toBe(0);
        const s1 = await readStatus(root, "s1");
        const completedAt1 = (s1.phases as Record<string, Record<string, unknown>>).derive?.completed_at as string;

        // second run (idempotent)
        const r2 = await run(["set", "s1", "derive", "done"], root);
        expect(r2.code).toBe(0);
        const s2 = await readStatus(root, "s1");
        const completedAt2 = (s2.phases as Record<string, Record<string, unknown>>).derive?.completed_at as string;

        expect(completedAt2).toBe(completedAt1);
        const beads = s2.beads as Record<string, unknown>;
        expect(beads.completion).toEqual(["derive"]); // not duplicated
      },
    );
  });

  it("set generate started → state in_progress, beads.current_phase === generate", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "generate", "started"], root);
        expect(r.code).toBe(0);

        const status = await readStatus(root, "s1");
        const phases = status.phases as Record<string, Record<string, unknown>>;
        expect(phases.generate?.state).toBe("in_progress");
        expect(phases.generate?.started_at).toBeTruthy();

        const beads = status.beads as Record<string, unknown>;
        expect(beads.current_phase).toBe("generate");
      },
    );
  });

  it("set in_progress alias behaves like started", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "review", "in_progress"], root);
        expect(r.code).toBe(0);

        const status = await readStatus(root, "s1");
        const phases = status.phases as Record<string, Record<string, unknown>>;
        expect(phases.review?.state).toBe("in_progress");
      },
    );
  });

  it("normalization: legacy status with string phases and missing beads/dirty is healed", async () => {
    const legacyYaml = yamlStringify({
      scenario_id: "s1",
      derived_at: "2024-01-01T00:00:00.000Z",
      phases: { derive: "closed" },
    });
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": legacyYaml },
      async (root) => {
        // run a set to trigger normalization + mutation
        const r = await run(["set", "s1", "generate", "started"], root);
        expect(r.code).toBe(0);

        const status = await readStatus(root, "s1");
        // healed: beads exists
        expect(status.beads).toBeTruthy();
        const beads = status.beads as Record<string, unknown>;
        expect(beads.epic).toBe("ori-scenario-s1");
        expect(beads.current_phase).toBe("generate");
        expect(beads.completion).toEqual([]);

        // healed: dirty exists
        expect(Array.isArray(status.dirty)).toBe(true);

        // healed: derive string → object
        const phases = status.phases as Record<string, Record<string, unknown>>;
        expect(phases.derive?.state).toBe("done");

        // new phase applied
        expect(phases.generate?.state).toBe("in_progress");
      },
    );
  });

  it("set with invalid phase → exit 1 with error message", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "bogus", "done"], root);
        expect(r.code).toBe(1);
        expect(r.all).toContain("Invalid phase");
      },
    );
  });

  it("missing status.yaml → exit 1", async () => {
    await withFixture({}, async (root) => {
      const r = await run(["set", "s1", "derive", "done"], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain("status.yaml not found");
    });
  });

  it("set with invalid state → exit 1", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "derive", "bogus"], root);
        expect(r.code).toBe(1);
        expect(r.all).toContain("Invalid state");
      },
    );
  });

  it("set derive failed → state failed, current_phase unchanged", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "derive", "failed"], root);
        expect(r.code).toBe(0);

        const status = await readStatus(root, "s1");
        const phases = status.phases as Record<string, Record<string, unknown>>;
        expect(phases.derive?.state).toBe("failed");
        expect(phases.derive?.started_at).toBeTruthy();
        expect(phases.derive?.completed_at).toBeUndefined();

        const beads = status.beads as Record<string, unknown>;
        expect(beads.current_phase).toBeNull(); // unchanged from scaffold
      },
    );
  });

  it("set complete/completed aliases behave like done", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1", "derive", "complete"], root);
        expect(r.code).toBe(0);
        const s1 = await readStatus(root, "s1");
        expect((s1.phases as Record<string, Record<string, unknown>>).derive?.state).toBe("done");

        const r2 = await run(["set", "s1", "generate", "completed"], root);
        expect(r2.code).toBe(0);
        const s2 = await readStatus(root, "s1");
        expect((s2.phases as Record<string, Record<string, unknown>>).generate?.state).toBe("done");
      },
    );
  });

  it("done advances current_phase to next phase not yet completed", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        await run(["set", "s1", "derive", "done"], root);
        const s1 = await readStatus(root, "s1");
        expect((s1.beads as Record<string, unknown>).current_phase).toBe("generate");

        await run(["set", "s1", "generate", "done"], root);
        const s2 = await readStatus(root, "s1");
        expect((s2.beads as Record<string, unknown>).current_phase).toBe("review");
      },
    );
  });

  it("done on final phase sets current_phase to null", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        await run(["set", "s1", "derive", "done"], root);
        await run(["set", "s1", "generate", "done"], root);
        await run(["set", "s1", "review", "done"], root);
        await run(["set", "s1", "finalize", "done"], root);
        const s = await readStatus(root, "s1");
        expect((s.beads as Record<string, unknown>).current_phase).toBeNull();
        expect((s.beads as Record<string, unknown>).completion).toEqual(["derive", "generate", "review", "finalize"]);
      },
    );
  });
});

describe("scenario-status show", () => {
  it("show prints yaml by default", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["show", "s1"], root);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain("scenario_id: s1");
        expect(r.stdout).toContain("beads:");
      },
    );
  });

  it("show --json prints JSON", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["show", "s1", "--json"], root);
        expect(r.code).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.scenario_id).toBe("s1");
        expect(parsed.beads).toBeTruthy();
      },
    );
  });

  it("show on missing status.yaml → exit 1", async () => {
    await withFixture({}, async (root) => {
      const r = await run(["show", "s1"], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain("status.yaml not found");
    });
  });

  it("show normalizes legacy data", async () => {
    const legacyYaml = yamlStringify({
      scenario_id: "s1",
      phases: { derive: "closed" },
    });
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": legacyYaml },
      async (root) => {
        const r = await run(["show", "s1", "--json"], root);
        expect(r.code).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.beads.epic).toBe("ori-scenario-s1");
        expect(parsed.dirty).toEqual([]);
        expect(parsed.phases.derive.state).toBe("done");
      },
    );
  });
});

describe("scenario-status usage", () => {
  it("no args → usage to stderr + exit 1", async () => {
    await withFixture({}, async (root) => {
      const r = await run([], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain("Usage");
    });
  });

  it("unknown command → usage + exit 1", async () => {
    await withFixture({}, async (root) => {
      const r = await run(["bogus", "s1"], root);
      expect(r.code).toBe(1);
      expect(r.all).toContain("Usage");
    });
  });

  it("set with missing args → usage + exit 1", async () => {
    await withFixture(
      { ".ori/scenarios/s1/status.yaml": freshStatus("s1") },
      async (root) => {
        const r = await run(["set", "s1"], root);
        expect(r.code).toBe(1);
        expect(r.all).toContain("Usage");
      },
    );
  });
});