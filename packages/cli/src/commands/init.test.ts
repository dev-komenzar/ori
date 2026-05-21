import { mkdtemp, rm, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "./init.js";
import { DOMAIN_SCAFFOLD_PATHS } from "../utils/domain-scaffold.js";

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
});
