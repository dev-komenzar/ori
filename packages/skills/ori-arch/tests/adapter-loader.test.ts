import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAdaptersDir } from "../src/internal/adapter-loader.js";

describe("resolveAdaptersDir — apm install layout (apm_modules cache)", () => {
  let cwd: string;
  let originalCwd: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "ori-adapter-loader-"));
    originalCwd = process.cwd();
    originalEnv = process.env.ORI_ADAPTERS_DIR;
    delete process.env.ORI_ADAPTERS_DIR;
    process.chdir(cwd);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.ORI_ADAPTERS_DIR;
    } else {
      process.env.ORI_ADAPTERS_DIR = originalEnv;
    }
    await rm(cwd, { recursive: true, force: true });
  });

  it("resolves adapters under apm_modules/<owner>/<repo>/.apm/contexts/adapters/", async () => {
    const adaptersDir = join(
      cwd,
      "apm_modules",
      "dev-komenzar",
      "ori",
      ".apm",
      "contexts",
      "adapters",
    );
    await mkdir(join(adaptersDir, "eslint"), { recursive: true });
    await writeFile(join(adaptersDir, "eslint", "index.js"), "// stub\n");

    const resolved = await resolveAdaptersDir({});
    expect(resolved).toBe(adaptersDir);
  });

  it("walks apm_modules to find any owner/repo with adapters (fork-friendly)", async () => {
    const adaptersDir = join(
      cwd,
      "apm_modules",
      "some-fork",
      "ori-fork",
      ".apm",
      "contexts",
      "adapters",
    );
    await mkdir(join(adaptersDir, "eslint"), { recursive: true });
    await writeFile(join(adaptersDir, "eslint", "index.js"), "// stub\n");

    const resolved = await resolveAdaptersDir({});
    expect(resolved).toBe(adaptersDir);
  });

  it("respects --adapters-dir override before walking apm_modules", async () => {
    const override = join(cwd, "custom-adapters");
    await mkdir(join(override, "eslint"), { recursive: true });
    await writeFile(join(override, "eslint", "index.js"), "// stub\n");

    const apmModulesAdapters = join(
      cwd,
      "apm_modules",
      "dev-komenzar",
      "ori",
      ".apm",
      "contexts",
      "adapters",
    );
    await mkdir(join(apmModulesAdapters, "eslint"), { recursive: true });
    await writeFile(join(apmModulesAdapters, "eslint", "index.js"), "// stub\n");

    const resolved = await resolveAdaptersDir({ adaptersDir: override });
    expect(resolved).toBe(override);
  });

  it("respects ORI_ADAPTERS_DIR env var before walking apm_modules", async () => {
    const envDir = join(cwd, "env-adapters");
    await mkdir(join(envDir, "eslint"), { recursive: true });
    await writeFile(join(envDir, "eslint", "index.js"), "// stub\n");

    const apmModulesAdapters = join(
      cwd,
      "apm_modules",
      "dev-komenzar",
      "ori",
      ".apm",
      "contexts",
      "adapters",
    );
    await mkdir(join(apmModulesAdapters, "eslint"), { recursive: true });
    process.env.ORI_ADAPTERS_DIR = envDir;

    const resolved = await resolveAdaptersDir({});
    expect(resolved).toBe(envDir);
  });
});
