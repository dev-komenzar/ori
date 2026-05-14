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
  args: { template?: string; force?: boolean; skipTauriInit?: boolean } = {},
): Promise<void> {
  const original = process.cwd();
  process.chdir(cwd);
  try {
    const runner = initCommand.run;
    if (typeof runner !== "function") throw new Error("init.run missing");
    const ctx = {
      args: {
        _: [],
        template: args.template,
        force: args.force ?? false,
        "skip-tauri-init": args.skipTauriInit ?? true,
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

  it("creates .ori/ scaffold without a template", async () => {
    await runInit(tmp);
    expect(await fileExists(join(tmp, ".ori/config.yaml"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/.gitignore"))).toBe(true);
    for (const rel of DOMAIN_SCAFFOLD_PATHS) {
      expect(await fileExists(join(tmp, rel))).toBe(true);
    }
    expect(await fileExists(join(tmp, "package.json"))).toBe(false);
  });

  it("seeds aggregates.md with a status:pending frontmatter anchor", async () => {
    await runInit(tmp);
    const body = await readFile(join(tmp, ".ori/domain/aggregates.md"), "utf8");
    expect(body).toContain("status: pending");
    expect(body).toContain("# Aggregates");
  });

  it("copies template files when --template ddd-typescript is given", async () => {
    await runInit(tmp, { template: "ddd-typescript" });
    expect(await fileExists(join(tmp, "package.json"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/architecture.md"))).toBe(true);
    expect(await fileExists(join(tmp, "src/lib/tasks/index.ts"))).toBe(true);
    expect(await fileExists(join(tmp, "src/lib/tasks/domain/task-id.ts"))).toBe(true);
    expect(await fileExists(join(tmp, "src/ui-entity/task-card/index.ts"))).toBe(true);
    expect(await fileExists(join(tmp, "src/ui-feature/complete-task/index.ts"))).toBe(true);
    expect(await fileExists(join(tmp, "src/ui-widget/task-list/index.ts"))).toBe(true);
    expect(await fileExists(join(tmp, "src/ui-page/tasks/index.ts"))).toBe(true);
  });

  it("copies the ori overlay when --template ddd-typescript-tauri is given (Tauri-owned files delegated)", async () => {
    await runInit(tmp, { template: "ddd-typescript-tauri", skipTauriInit: true });
    // TS side — same shape as ddd-typescript
    expect(await fileExists(join(tmp, "package.json"))).toBe(true);
    expect(await fileExists(join(tmp, ".ori/architecture.md"))).toBe(true);
    expect(await fileExists(join(tmp, "src/lib/tasks/index.ts"))).toBe(true);
    expect(await fileExists(join(tmp, "src/ui-feature/complete-task/index.ts"))).toBe(true);
    // tauri-specta target — generated bindings stub
    expect(await fileExists(join(tmp, "src/lib/shared/ipc/bindings.ts"))).toBe(true);
    // Rust overlay: lib.rs + features tree stay (we own these)
    expect(await fileExists(join(tmp, "src-tauri/src/lib.rs"))).toBe(true);
    expect(await fileExists(join(tmp, "src-tauri/src/features/mod.rs"))).toBe(true);
    expect(await fileExists(join(tmp, "src-tauri/src/features/tasks/mod.rs"))).toBe(true);
    expect(await fileExists(join(tmp, "src-tauri/src/features/tasks/domain.rs"))).toBe(true);
    expect(await fileExists(join(tmp, "src-tauri/src/features/tasks/commands.rs"))).toBe(true);
    expect(await fileExists(join(tmp, "src-tauri/src/features/shared/mod.rs"))).toBe(true);
    // Tauri-owned files delegated to 'tauri init' — absent from the template
    expect(await fileExists(join(tmp, "src-tauri/Cargo.toml"))).toBe(false);
    expect(await fileExists(join(tmp, "src-tauri/tauri.conf.json"))).toBe(false);
    expect(await fileExists(join(tmp, "src-tauri/build.rs"))).toBe(false);
    expect(await fileExists(join(tmp, "src-tauri/src/main.rs"))).toBe(false);
    expect(await fileExists(join(tmp, "src-tauri/capabilities/default.json"))).toBe(false);
  });

  it("preserves the tauri-specta wiring in our lib.rs (so 'tauri init' overwrite is reversible)", async () => {
    await runInit(tmp, { template: "ddd-typescript-tauri", skipTauriInit: true });
    const libRs = await readFile(join(tmp, "src-tauri/src/lib.rs"), "utf8");
    expect(libRs).toContain("tauri_specta");
    expect(libRs).toContain("collect_commands");
    expect(libRs).toContain("features::tasks::complete_task_cmd");
  });

  it("copies CLAUDE.md and AGENTS.md to the project root", async () => {
    await runInit(tmp, { template: "ddd-typescript-tauri", skipTauriInit: true });
    expect(await fileExists(join(tmp, "CLAUDE.md"))).toBe(true);
    expect(await fileExists(join(tmp, "AGENTS.md"))).toBe(true);
    const claude = await readFile(join(tmp, "CLAUDE.md"), "utf8");
    expect(claude).toContain("@tauri-apps/api/core");
    expect(claude).toContain("lib/shared/ipc");
  });

  it("rejects unknown template names with exit code 2", async () => {
    const exitSpy = vi_spyExit();
    try {
      await runInit(tmp, { template: "nope" });
    } catch (e) {
      // process.exit throws via the spy
    }
    expect(exitSpy.called).toBe(true);
    expect(exitSpy.code).toBe(2);
    exitSpy.restore();
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

function vi_spyExit(): { called: boolean; code: number | undefined; restore(): void } {
  const original = process.exit;
  const state = { called: false, code: undefined as number | undefined };
  process.exit = ((code?: number) => {
    state.called = true;
    state.code = code;
    throw new Error(`process.exit(${code}) called`);
  }) as never;
  return {
    get called() {
      return state.called;
    },
    get code() {
      return state.code;
    },
    restore() {
      process.exit = original;
    },
  };
}
