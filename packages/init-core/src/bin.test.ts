import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "./bin.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Hand-roll stream capture instead of vi.spyOn — `process.stdout.write` is an
// overloaded function, and the overload signature does not unify with vitest's
// generic mock parameter type. Direct property reassignment keeps strict tsc
// happy while still letting us assert on captured output.
type WriteFn = typeof process.stdout.write;

describe("ori-init-skeleton bin", () => {
  let tmp: string;
  let stdout: string;
  let stderr: string;
  let originalStdoutWrite: WriteFn;
  let originalStderrWrite: WriteFn;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ori-init-core-bin-"));
    stdout = "";
    stderr = "";
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    }) as WriteFn;
    process.stderr.write = ((chunk: unknown): boolean => {
      stderr += String(chunk);
      return true;
    }) as WriteFn;
  });

  afterEach(async () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns 0 and writes skeleton when --dest is given", async () => {
    const code = await run(["--dest", tmp]);
    expect(code).toBe(0);
    expect(await fileExists(join(tmp, ".ori/config.yaml"))).toBe(true);
    expect(stdout).toContain("ori workspace initialized");
  });

  it("returns 0 on --help without doing anything", async () => {
    const code = await run(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage:");
  });

  it("returns 2 on unknown arg", async () => {
    const code = await run(["--bogus"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--bogus");
  });

  it("returns 2 when --dest has no value", async () => {
    const code = await run(["--dest"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--dest");
  });

  it("respects --force on a second run", async () => {
    await run(["--dest", tmp]);
    stdout = "";
    const code = await run(["--dest", tmp, "--force"]);
    expect(code).toBe(0);
    expect(stdout).toContain("config.yaml: written");
  });
});
