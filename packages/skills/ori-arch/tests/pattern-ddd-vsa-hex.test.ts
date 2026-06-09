import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseArchitectureSpec,
  parseFrontmatter,
  type OriArchAdapter,
} from "@ori-ori/parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/skills/ori-arch/tests/ -> repo root
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const PATTERN_ROOT = join(
  REPO_ROOT,
  ".apm",
  "contexts",
  "patterns",
  "ddd-vsa-hex",
);

// Load adapters from the bundled APM contexts location — same path the skill
// resolves at runtime via resolveAdaptersDir(). `pretest` (root package.json)
// runs build:adapters so these bundles are guaranteed fresh.
const ADAPTERS_DIR = join(REPO_ROOT, ".apm", "contexts", "adapters");
const eslintMod = (await import(
  join(ADAPTERS_DIR, "eslint", "index.js")
)) as { default: OriArchAdapter };
const rustMod = (await import(
  join(ADAPTERS_DIR, "rust", "index.js")
)) as { default: OriArchAdapter };
const eslintAdapter: OriArchAdapter = eslintMod.default;
const rustAdapter: OriArchAdapter = rustMod.default;

const SUBSTITUTIONS = {
  APP_NAME: "myapp",
  BC_NAME: "task-management",
  BC_NAME_RS: "task_management",
} as const;

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`unresolved placeholder: ${whole}`);
    return v;
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("pattern:ddd-vsa-hex — pattern.md / ai-notes.md (ori-p2f / design.md §6)", () => {
  it("pattern.md frontmatter declares the canonical ori node identity", async () => {
    const raw = await readFile(join(PATTERN_ROOT, "pattern.md"), "utf8");
    const { data } = parseFrontmatter(raw);
    const ori = data.ori as Record<string, unknown> | undefined;
    expect(ori, "frontmatter must include an `ori:` block").toBeDefined();
    expect(ori?.node_id).toBe("pattern:ddd-vsa-hex");
    expect(ori?.type).toBe("pattern");
    expect(typeof ori?.version).toBe("string");
    expect(ori?.default_layer_set).toBe("ddd-vsa-hex-ts");
    expect(Array.isArray(ori?.alternate_layer_sets)).toBe(true);
    expect(ori?.alternate_layer_sets as string[]).toContain("ddd-vsa-hex-rs");
  });

  it("pattern.md body documents every section design.md §6 mandates", async () => {
    const raw = await readFile(join(PATTERN_ROOT, "pattern.md"), "utf8");
    const { content } = parseFrontmatter(raw);
    for (const heading of [
      "## Summary",
      "## When to use",
      "## When NOT to use",
      "## Tradeoffs",
      "## Conceptual structure",
      "## Layer responsibilities",
      "## Dependency rules",
      "## Naming conventions",
      "## Cross-cutting concerns placement",
    ]) {
      expect(content, `pattern.md must contain "${heading}"`).toContain(heading);
    }
  });

  it("ai-notes.md declares an ori node pointing at the pattern", async () => {
    const raw = await readFile(join(PATTERN_ROOT, "ai-notes.md"), "utf8");
    const { data } = parseFrontmatter(raw);
    const ori = data.ori as Record<string, unknown> | undefined;
    expect(ori?.node_id).toBe("pattern:ddd-vsa-hex/ai-notes");
    expect(ori?.type).toBe("pattern-ai-notes");
    expect(ori?.applies_to).toBe("pattern:ddd-vsa-hex");
  });
});

describe("pattern:ddd-vsa-hex — stacks/typescript/architecture.md.tpl", () => {
  const tplPath = join(
    PATTERN_ROOT,
    "stacks",
    "typescript",
    "architecture.md.tpl",
  );

  it("contains the placeholders /ori-arch is expected to resolve", async () => {
    const tpl = await readFile(tplPath, "utf8");
    expect(tpl).toContain("{{APP_NAME}}");
    expect(tpl).toContain("{{BC_NAME}}");
    // typescript-only stack has no Rust BC name placeholder.
    expect(tpl).not.toContain("{{BC_NAME_RS}}");
  });

  it("renders to a parsable ArchitectureSpec after substitution", async () => {
    const tpl = await readFile(tplPath, "utf8");
    const rendered = render(tpl, SUBSTITUTIONS);
    const spec = parseArchitectureSpec(rendered);
    expect(spec.version).toBe(1);
    expect(spec.roots).toHaveLength(1);
    const root = spec.roots[0]!;
    expect(root.app).toBe("myapp");
    expect(root.path).toBe("apps/myapp/src");
    expect(root.layer_set).toBe("ddd-vsa-hex-ts");
    expect(root.slice_root).toBe("task-management");
    expect(root.slice_subdir).toBe("slices");
    expect(root.public_entry).toBe("index.ts");
    expect(spec.cross_slice.prohibited_direct).toBe(true);
  });

  it("compiles through the eslint adapter using the substituted app/BC names", async () => {
    const tpl = await readFile(tplPath, "utf8");
    const rendered = render(tpl, SUBSTITUTIONS);
    const spec = parseArchitectureSpec(rendered);
    const result = await eslintAdapter.export(spec, spec.roots[0]!);
    expect(result.files).toHaveLength(1);
    const content = result.files[0]!.content;
    expect(content).toContain("apps/myapp/src/task-management/shared/**");
    expect(content).toContain("apps/myapp/src/task-management/slices/*/**");
    expect(content).toContain('"pattern": "apps/myapp/src/ui-widget/**"');
    expect(content).toContain('"pattern": "apps/myapp/src/ui-page/**"');
  });
});

describe("pattern:ddd-vsa-hex — stacks/typescript-tauri/architecture.md.tpl", () => {
  const tplPath = join(
    PATTERN_ROOT,
    "stacks",
    "typescript-tauri",
    "architecture.md.tpl",
  );

  it("contains every placeholder needed for both roots", async () => {
    const tpl = await readFile(tplPath, "utf8");
    expect(tpl).toContain("{{APP_NAME}}");
    expect(tpl).toContain("{{BC_NAME}}");
    expect(tpl).toContain("{{BC_NAME_RS}}");
  });

  it("renders to a two-root ArchitectureSpec with the Tauri cross-root binding", async () => {
    const tpl = await readFile(tplPath, "utf8");
    const rendered = render(tpl, SUBSTITUTIONS);
    const spec = parseArchitectureSpec(rendered);
    expect(spec.roots).toHaveLength(2);
    const ts = spec.roots.find((r) => r.id === "ts")!;
    const rs = spec.roots.find((r) => r.id === "rs")!;
    expect(ts.path).toBe("apps/myapp/src");
    expect(ts.slice_root).toBe("task-management");
    expect(rs.path).toBe("apps/myapp/src-tauri/src");
    expect(rs.slice_root).toBe("task_management");

    expect(spec.cross_root).toHaveLength(1);
    const xroot = spec.cross_root![0]!;
    expect(xroot.from.root).toBe("rs");
    expect(xroot.to.root).toBe("ts");
    expect(xroot.generator).toBe("tauri-specta");
    expect(xroot.to.path).toBe(
      "apps/myapp/src/task-management/shared/ipc/bindings.ts",
    );
  });

  it("eslint adapter compiles the TS root with raw-invoke forbidden_imports", async () => {
    const tpl = await readFile(tplPath, "utf8");
    const rendered = render(tpl, SUBSTITUTIONS);
    const spec = parseArchitectureSpec(rendered);
    const tsRoot = spec.roots.find((r) => r.id === "ts")!;
    const result = await eslintAdapter.export(spec, tsRoot);
    const content = result.files[0]!.content;
    // ui-widget / ui-page must be blocked from importing @tauri-apps/api/core.
    expect(content).toContain("@tauri-apps/api/core");
    // The deny-message must steer authors toward the BC-rooted ipc/ bindings.
    expect(content).toContain("task-management/shared/ipc");
    expect(content).toContain("apps/myapp/src/ui-widget/**");
    expect(content).toContain("apps/myapp/src/ui-page/**");
  });

  it("rust adapter compiles the rs root to a self-contained tests/arch.rs", async () => {
    const tpl = await readFile(tplPath, "utf8");
    const rendered = render(tpl, SUBSTITUTIONS);
    const spec = parseArchitectureSpec(rendered);
    const rsRoot = spec.roots.find((r) => r.id === "rs")!;
    const result = await rustAdapter.export(spec, rsRoot);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("apps/myapp/src-tauri/tests/arch.rs");
    const content = result.files[0]!.content;
    expect(content).toContain("AUTO-GENERATED by ori-arch");
    expect(content).toContain(
      'const ROOT_PATH: &str = "apps/myapp/src-tauri/src"',
    );
    expect(content).toContain(
      'const SLICE_BASE: &str = "apps/myapp/src-tauri/src/task_management/"',
    );
    expect(content).toContain('("domain", &["shared"])');
  });

  it("each adapter skips the other language root with a note", async () => {
    const tpl = await readFile(tplPath, "utf8");
    const rendered = render(tpl, SUBSTITUTIONS);
    const spec = parseArchitectureSpec(rendered);
    const tsRoot = spec.roots.find((r) => r.id === "ts")!;
    const rsRoot = spec.roots.find((r) => r.id === "rs")!;

    const rustOnTs = await rustAdapter.export(spec, tsRoot);
    expect(rustOnTs.files).toHaveLength(0);
    expect((rustOnTs.notes ?? []).join("\n")).toMatch(/skipped/);

    const eslintOnRs = await eslintAdapter.export(spec, rsRoot);
    expect(eslintOnRs.files).toHaveLength(0);
    expect((eslintOnRs.notes ?? []).join("\n")).toMatch(/skipped/);
  });
});

describe("pattern:ddd-vsa-hex — example-slice/ inventory", () => {
  it("typescript stack ships a worked complete-task slice", async () => {
    const base = join(
      PATTERN_ROOT,
      "stacks",
      "typescript",
      "example-slice",
      "task-management",
    );
    const expected = [
      "shared/index.ts",
      "shared/types/result.ts",
      "shared/types/index.ts",
      "shared/events/event.ts",
      "shared/events/index.ts",
      "shared/contracts/index.ts",
      "slices/complete-task/index.ts",
      "slices/complete-task/domain/task.ts",
      "slices/complete-task/domain/task-id.ts",
      "slices/complete-task/domain/task-title.ts",
      "slices/complete-task/domain/events.ts",
      "slices/complete-task/application/complete-task.ts",
      "slices/complete-task/presentation/task-card.ts",
      "slices/complete-task/tests/task.test.ts",
    ];
    for (const rel of expected) {
      expect(await fileExists(join(base, rel)), rel).toBe(true);
    }
  });

  it("typescript-tauri stack ships both TS and Rust worked code", async () => {
    const base = join(
      PATTERN_ROOT,
      "stacks",
      "typescript-tauri",
      "example-slice",
    );
    const ts = join(base, "ts", "task-management");
    const rs = join(base, "rust", "task_management");
    const tsExpected = [
      "shared/index.ts",
      "shared/ipc/bindings.ts",
      "shared/ipc/index.ts",
      "slices/complete-task/index.ts",
      "slices/complete-task/domain/task.ts",
      "slices/complete-task/application/complete-task.ts",
      "slices/complete-task/tests/task.test.ts",
    ];
    const rsExpected = [
      "mod.rs",
      "shared/mod.rs",
      "shared/result.rs",
      "shared/events.rs",
      "slices/mod.rs",
      "slices/complete_task/mod.rs",
      "slices/complete_task/domain.rs",
      "slices/complete_task/application.rs",
      "slices/complete_task/infrastructure.rs",
      "slices/complete_task/commands.rs",
    ];
    for (const rel of tsExpected) {
      expect(await fileExists(join(ts, rel)), `ts/${rel}`).toBe(true);
    }
    for (const rel of rsExpected) {
      expect(await fileExists(join(rs, rel)), `rust/${rel}`).toBe(true);
    }
    expect(await fileExists(join(base, "rust", "lib.rs"))).toBe(true);
  });

  it("example-slice ships no bootstrap files (package.json / tsconfig / Cargo.toml)", async () => {
    const bases = [
      join(PATTERN_ROOT, "stacks", "typescript", "example-slice"),
      join(PATTERN_ROOT, "stacks", "typescript-tauri", "example-slice"),
    ];
    const forbidden = [
      "package.json",
      "tsconfig.json",
      "eslint.config.js",
      "vitest.config.ts",
      "Cargo.toml",
    ];
    for (const base of bases) {
      for (const rel of forbidden) {
        expect(
          await fileExists(join(base, rel)),
          `${base}/${rel} should not exist (bootstrap belongs to upstream framework init)`,
        ).toBe(false);
      }
    }
  });
});

describe("pattern:ddd-vsa-hex — Rust example-slice uses idiomatic super:: imports", () => {
  it("complete_task application/infrastructure resolve siblings via super::", async () => {
    // arch-adapter-rust resolves super:: for both mod.rs and non-mod.rs
    // siblings (ori-w5j), so slice-internal code uses Rust's standard
    // module-relative paths.
    const sliceRoot = join(
      PATTERN_ROOT,
      "stacks",
      "typescript-tauri",
      "example-slice",
      "rust",
      "task_management",
      "slices",
      "complete_task",
    );
    const application = await readFile(join(sliceRoot, "application.rs"), "utf8");
    expect(application).toMatch(/^use super::domain::/m);
    expect(application).toMatch(/^use super::infrastructure::/m);
  });
});

describe("pattern:ddd-vsa-hex — TS example-slice respects pattern dependency rules", () => {
  it("complete-task imports only stay within slice or reach shared (no cross-slice)", async () => {
    const sliceRoot = join(
      PATTERN_ROOT,
      "stacks",
      "typescript",
      "example-slice",
      "task-management",
      "slices",
      "complete-task",
    );
    const files = [
      "index.ts",
      "domain/task.ts",
      "domain/task-id.ts",
      "domain/task-title.ts",
      "domain/events.ts",
      "application/complete-task.ts",
      "presentation/task-card.ts",
      "tests/task.test.ts",
    ];
    const importRe = /^\s*import[^"']*["']([^"']+)["']/gm;
    for (const rel of files) {
      const src = await readFile(join(sliceRoot, rel), "utf8");
      let match: RegExpExecArray | null;
      while ((match = importRe.exec(src)) !== null) {
        const spec = match[1]!;
        if (!spec.startsWith(".") && !spec.startsWith("..")) continue;
        // Allowed: same slice (./...), or BC-internal shared via ../../../shared/...
        const goesIntoOtherSlice = /\.\.\/\.\.\/[^/]+(?:\/|$)/.test(spec)
          && !spec.includes("../../../shared/")
          && !spec.startsWith("../../shared/");
        const reachesIntoAnotherSliceDir = spec.includes("../../slices/")
          || spec.includes("../slices/");
        expect(
          goesIntoOtherSlice && reachesIntoAnotherSliceDir,
          `${rel}: import "${spec}" looks like a cross-slice direct reach`,
        ).toBe(false);
      }
    }
  });
});
