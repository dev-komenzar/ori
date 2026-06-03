import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";
import { initCommand } from "./init.js";
import { DOMAIN_SCAFFOLD_PATHS } from "@ori-ori/init-core";

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

describe("init command (CLI integration)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ori-init-cli-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("declares the init metadata", () => {
    const meta = initCommand.meta as { name?: string } | undefined;
    expect(meta?.name).toBe("init");
    expect(typeof initCommand.run).toBe("function");
  });

  it("delegates to init-core: writes config.yaml and all domain scaffolds", async () => {
    await runInit(tmp);
    expect(await fileExists(join(tmp, ".ori/config.yaml"))).toBe(true);
    for (const rel of DOMAIN_SCAFFOLD_PATHS) {
      expect(await fileExists(join(tmp, rel))).toBe(true);
    }
    const config = yamlParse(await readFile(join(tmp, ".ori/config.yaml"), "utf8")) as {
      ori: { current_agent: string };
    };
    expect(config.ori.current_agent).toBe("claude");
  });

  it("does NOT touch the project root (no template scaffold from init)", async () => {
    await runInit(tmp);
    expect(await fileExists(join(tmp, "package.json"))).toBe(false);
    expect(await fileExists(join(tmp, "CLAUDE.md"))).toBe(false);
    expect(await fileExists(join(tmp, "apps"))).toBe(false);
  });
});
