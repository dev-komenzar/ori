import { mkdtemp, rm, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";
import { createSkeleton, deriveAppName } from "./skeleton.js";
import { DOMAIN_SCAFFOLD_PATHS, seedDomainScaffolds } from "./domain-scaffold.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("createSkeleton", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ori-init-core-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("creates the .ori/ skeleton silently (no template scaffold)", async () => {
    await createSkeleton({ cwd: tmp });
    expect(await fileExists(join(tmp, ".ori/config.yaml"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/.gitignore"))).toBe(true);
    for (const rel of DOMAIN_SCAFFOLD_PATHS) {
      expect(await fileExists(join(tmp, rel))).toBe(true);
    }
    expect(await fileExists(join(tmp, "package.json"))).toBe(false);
    expect(await fileExists(join(tmp, "CLAUDE.md"))).toBe(false);
  });

  it("reports configWritten=true on first run", async () => {
    const r = await createSkeleton({ cwd: tmp });
    expect(r.configWritten).toBe(true);
    expect(r.configAlreadyExisted).toBe(false);
  });

  it("does not overwrite existing config.yaml without force", async () => {
    await mkdir(join(tmp, ".ori"), { recursive: true });
    await writeFile(join(tmp, ".ori/config.yaml"), "user: kept\n", "utf8");
    const r = await createSkeleton({ cwd: tmp });
    expect(r.configWritten).toBe(false);
    expect(r.configAlreadyExisted).toBe(true);
    const body = await readFile(join(tmp, ".ori/config.yaml"), "utf8");
    expect(body).toBe("user: kept\n");
  });

  it("overwrites existing config.yaml when force=true", async () => {
    await mkdir(join(tmp, ".ori"), { recursive: true });
    await writeFile(join(tmp, ".ori/config.yaml"), "user: kept\n", "utf8");
    const r = await createSkeleton({ cwd: tmp, force: true });
    expect(r.configWritten).toBe(true);
    expect(r.configAlreadyExisted).toBe(true);
  });

  it("does not overwrite existing scaffold files without force", async () => {
    await mkdir(join(tmp, ".ori/domain"), { recursive: true });
    await writeFile(join(tmp, ".ori/domain/aggregates.md"), "USER CONTENT\n", "utf8");
    await createSkeleton({ cwd: tmp });
    const body = await readFile(join(tmp, ".ori/domain/aggregates.md"), "utf8");
    expect(body).toBe("USER CONTENT\n");
  });

  it("overwrites scaffold files when force=true", async () => {
    await mkdir(join(tmp, ".ori/domain"), { recursive: true });
    await writeFile(join(tmp, ".ori/domain/aggregates.md"), "USER CONTENT\n", "utf8");
    await createSkeleton({ cwd: tmp, force: true });
    const body = await readFile(join(tmp, ".ori/domain/aggregates.md"), "utf8");
    expect(body).toContain("status: pending");
  });

  it("writes workspace.apps with a default app derived from the cwd folder name", async () => {
    const r = await createSkeleton({ cwd: tmp });
    const config = yamlParse(await readFile(join(tmp, ".ori/config.yaml"), "utf8")) as {
      ori: {
        workspace: {
          apps_root: string;
          apps: Array<{ name: string; path: string }>;
        };
        current_agent: string;
      };
    };
    expect(config.ori.workspace.apps_root).toBe("apps");
    expect(config.ori.workspace.apps).toHaveLength(1);
    const sanitized = deriveAppName(tmp);
    expect(config.ori.workspace.apps[0]).toEqual({
      name: sanitized,
      path: `apps/${sanitized}`,
    });
    expect(config.ori.current_agent).toBe("claude");
    expect(r.appName).toBe(sanitized);
  });

  it("does NOT create apps/ directory at init time (delegated to /ori-arch)", async () => {
    await createSkeleton({ cwd: tmp });
    expect(await fileExists(join(tmp, "apps"))).toBe(false);
  });

  it("places .gitkeep in empty directories for VCS tracking", async () => {
    await createSkeleton({ cwd: tmp });
    expect(await fileExists(join(tmp, ".ori/slices/.gitkeep"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/pages/.gitkeep"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/proposals/.gitkeep"))).toBe(true);
  });
});

describe("seedDomainScaffolds", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ori-init-core-scaffold-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scaffolds all 12 DDD phase outputs in the documented order", () => {
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

  it("reports written on first run and skipped on second run", async () => {
    const first = await seedDomainScaffolds({ cwd: tmp, force: false });
    expect(first.written).toEqual(DOMAIN_SCAFFOLD_PATHS);
    expect(first.skipped).toEqual([]);

    const second = await seedDomainScaffolds({ cwd: tmp, force: false });
    expect(second.written).toEqual([]);
    expect(second.skipped).toEqual(DOMAIN_SCAFFOLD_PATHS);
  });

  it("seeds validation.md and workflows/index.md with the expected phase pointer", async () => {
    await seedDomainScaffolds({ cwd: tmp, force: false });
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

  it("seeds aggregates.md with a status:pending frontmatter anchor", async () => {
    await seedDomainScaffolds({ cwd: tmp, force: false });
    const body = await readFile(join(tmp, ".ori/domain/aggregates.md"), "utf8");
    expect(body).toContain("status: pending");
    expect(body).toContain("# Aggregates");
  });
});

describe("deriveAppName", () => {
  it("lowercases and sanitizes the folder name", () => {
    expect(deriveAppName("/tmp/My_Cool_App")).toBe("my-cool-app");
    expect(deriveAppName("/tmp/foo.bar.baz")).toBe("foo-bar-baz");
    expect(deriveAppName("/tmp/--leading--")).toBe("leading");
  });

  it("returns 'app' for empty-sanitization results", () => {
    expect(deriveAppName("/tmp/___")).toBe("app");
  });

  it("returns the folder name from basename context", () => {
    expect(deriveAppName(join(tmpdir(), "demoapp"))).toBe(basename(join(tmpdir(), "demoapp")));
  });
});
