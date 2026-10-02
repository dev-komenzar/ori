import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAdaptersDir } from "../src/internal/adapter-loader.js";

describe("resolveAdaptersDir — --adapters-dir override + bundle-adjacent only (Phase K1, R2)", () => {
  let cwd: string;
  let originalCwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "ori-adapter-loader-"));
    originalCwd = process.cwd();
    process.chdir(cwd);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(cwd, { recursive: true, force: true });
  });

  it("resolves the explicit --adapters-dir override when the dir exists", async () => {
    const override = join(cwd, "custom-adapters");
    await mkdir(join(override, "eslint"), { recursive: true });
    await writeFile(join(override, "eslint", "index.js"), "// stub\n");

    const resolved = await resolveAdaptersDir({ adaptersDir: override });
    expect(resolved).toBe(override);
  });

  it("exits with code 2 when no adapters dir is found", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_: number) => undefined as never) as never);
    const errSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await resolveAdaptersDir({
      adaptersDir: join(cwd, "does-not-exist"),
    });

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errSpy).toHaveBeenCalled();
    const errMsg = errSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(errMsg).toMatch(/Adapters directory not found/);
    expect(errMsg).toMatch(/--adapters-dir/);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
