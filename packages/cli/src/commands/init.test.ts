import { mkdtemp, rm, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "./init.js";
import { DOMAIN_SCAFFOLD_PATHS, seedDomainScaffolds } from "../utils/domain-scaffold.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runInit(
  cwd: string,
  args: { force?: boolean } = {},
): Promise<void> {
  const original = process.cwd();
  process.chdir(cwd);
  try {
    const runner = initCommand.run;
    if (typeof runner !== "function") throw new Error("init.run missing");
    const ctx = {
      args: {
        _: [],
        force: args.force ?? false,
      },
      rawArgs: [],
      cmd: initCommand,
    } as unknown as Parameters<typeof runner>[0];
    await runner(ctx);
  } finally {
    process.chdir(original);
  }
}

describe("init command", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ori-init-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("declares the init metadata", () => {
    const meta = initCommand.meta as { name?: string } | undefined;
    expect(meta?.name).toBe("init");
    expect(typeof initCommand.run).toBe("function");
  });

  it("creates the .ori/ skeleton silently (no template scaffold)", async () => {
    await runInit(tmp);
    expect(await fileExists(join(tmp, ".ori/config.yaml"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/.gitignore"))).toBe(true);
    for (const rel of DOMAIN_SCAFFOLD_PATHS) {
      expect(await fileExists(join(tmp, rel))).toBe(true);
    }
    // Template scaffold is delegated to /ori-arch — init must NOT touch project root.
    expect(await fileExists(join(tmp, "package.json"))).toBe(false);
    expect(await fileExists(join(tmp, "src-tauri"))).toBe(false);
    expect(await fileExists(join(tmp, "CLAUDE.md"))).toBe(false);
    expect(await fileExists(join(tmp, "AGENTS.md"))).toBe(false);
  });

  it("seeds aggregates.md with a status:pending frontmatter anchor", async () => {
    await runInit(tmp);
    const body = await readFile(join(tmp, ".ori/domain/aggregates.md"), "utf8");
    expect(body).toContain("status: pending");
    expect(body).toContain("# Aggregates");
  });

  it("does not overwrite existing files without --force", async () => {
    await mkdir(join(tmp, ".ori/domain"), { recursive: true });
    await writeFile(join(tmp, ".ori/domain/aggregates.md"), "USER CONTENT\n", "utf8");
    await runInit(tmp);
    const body = await readFile(join(tmp, ".ori/domain/aggregates.md"), "utf8");
    expect(body).toBe("USER CONTENT\n");
  });

  it("overwrites existing files when --force is given", async () => {
    await mkdir(join(tmp, ".ori/domain"), { recursive: true });
    await writeFile(join(tmp, ".ori/domain/aggregates.md"), "USER CONTENT\n", "utf8");
    await runInit(tmp, { force: true });
    const body = await readFile(join(tmp, ".ori/domain/aggregates.md"), "utf8");
    expect(body).toContain("status: pending");
  });

  it("scaffolds all 12 DDD phase outputs (1-11a + types/code/workflows/ui-fields indexes)", async () => {
    expect(DOMAIN_SCAFFOLD_PATHS).toEqual([
      ".ori/domain/discovery.md",
      ".ori/domain/event-storming.md",
      ".ori/domain/bounded-contexts.md",
      ".ori/domain/context-map.md",
      ".ori/domain/aggregates.md",
      ".ori/domain/domain-events.md",
      ".ori/domain/validation.md",
      ".ori/domain/glossary.md",
      ".ori/domain/workflows/index.md",
      ".ori/domain/types.md",
      ".ori/domain/code/index.md",
      ".ori/domain/ui-fields/index.md",
    ]);
  });

  it("seedDomainScaffolds reports written on first run and skipped on second run", async () => {
    const first = await seedDomainScaffolds({ cwd: tmp, force: false });
    expect(first.written).toEqual(DOMAIN_SCAFFOLD_PATHS);
    expect(first.skipped).toEqual([]);

    const second = await seedDomainScaffolds({ cwd: tmp, force: false });
    expect(second.written).toEqual([]);
    expect(second.skipped).toEqual(DOMAIN_SCAFFOLD_PATHS);
  });

  it("places .gitkeep in empty directories for VCS tracking", async () => {
    await runInit(tmp);
    expect(await fileExists(join(tmp, ".ori/slices/.gitkeep"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/pages/.gitkeep"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/proposals/.gitkeep"))).toBe(true);
  });

  it("seeds validation.md and workflows/index.md with the expected phase pointer", async () => {
    await runInit(tmp);
    const validation = await readFile(join(tmp, ".ori/domain/validation.md"), "utf8");
    expect(validation).toContain("# Validation");
    expect(validation).toContain("/ori-ddd-7-validation");

    const workflowsIndex = await readFile(join(tmp, ".ori/domain/workflows/index.md"), "utf8");
    expect(workflowsIndex).toContain("# Workflows Index");
    expect(workflowsIndex).toContain("/ori-ddd-9-workflows");

    const uiFieldsIndex = await readFile(join(tmp, ".ori/domain/ui-fields/index.md"), "utf8");
    expect(uiFieldsIndex).toContain("# UI Fields Index");
    expect(uiFieldsIndex).toContain("/ori-ddd-11a-ui-fields");

    const codeIndex = await readFile(join(tmp, ".ori/domain/code/index.md"), "utf8");
    expect(codeIndex).toContain("# Code Index");
    expect(codeIndex).toContain("/ori-ddd-10-types");
  });
});
