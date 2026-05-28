import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import eslintAdapter from "@ori-ori/arch-adapter-eslint";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = join(__dirname, "..", "ddd-vsa-hex-typescript");

describe("ddd-vsa-hex-typescript template", () => {
  it("includes a parsable .ori/architecture.md aligned with design.md §12", async () => {
    const raw = await readFile(join(TEMPLATE_ROOT, ".ori/architecture.md"), "utf8");
    const spec = parseArchitectureSpec(raw);
    expect(spec.version).toBe(1);
    expect(spec.cross_slice.prohibited_direct).toBe(true);
    expect(spec.roots[0]?.slice_root).toBe("task-management");
    expect(spec.roots[0]?.slice_subdir).toBe("slices");
    expect(spec.roots[0]?.layer_set).toBe("ddd-vsa-hex-ts");
    expect(spec.roots[0]?.path).toBe("apps/template-app/src");
    expect(spec.roots[0]?.app).toBe("template-app");
  });

  it("produces an eslint config via the eslint adapter (apps/<app>/src/<bc>/slices)", async () => {
    const raw = await readFile(join(TEMPLATE_ROOT, ".ori/architecture.md"), "utf8");
    const spec = parseArchitectureSpec(raw);
    const result = await eslintAdapter.export(spec, spec.roots[0]!);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("eslint.config.ori.js");
    const content = result.files[0]!.content;
    expect(content).toContain("eslint-plugin-boundaries");
    // BC-internal shared sits beside slices/, not under it.
    expect(content).toContain("apps/template-app/src/task-management/shared/**");
    // Slice pattern descends one level deeper to honor slice_subdir = slices.
    expect(content).toContain("apps/template-app/src/task-management/slices/*/**");
  });

  it("encodes the two ddd-vsa-hex UI layers in the generated eslint config", async () => {
    const raw = await readFile(join(TEMPLATE_ROOT, ".ori/architecture.md"), "utf8");
    const spec = parseArchitectureSpec(raw);
    const result = await eslintAdapter.export(spec, spec.roots[0]!);
    const content = result.files[0]!.content;

    // ddd-vsa-hex-ts keeps only ui-widget and ui-page (FSD's ui-entity /
    // ui-feature were dropped in the design.md §6 simplification).
    expect(content).toContain('"pattern": "apps/template-app/src/ui-widget/**"');
    expect(content).toContain('"pattern": "apps/template-app/src/ui-page/**"');
    expect(content).not.toContain("ui-entity");
    expect(content).not.toContain("ui-feature");

    // ui-widget is allowed to import a domain slice (no need for an
    // ui-feature broker layer).
    expect(content).toMatch(/"from":\s*\[\s*"ui-widget"\s*\][\s\S]*"domain"/);
    // ui-page allow-list also contains domain (it can reach a slice through
    // ui-widget or directly via the slice's public index.ts).
    expect(content).toMatch(/"from":\s*\[\s*"ui-page"\s*\][\s\S]*"domain"/);
  });

  it("ships the canonical scaffolding files", async () => {
    const expected = [
      "README.md",
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "eslint.config.js",
      ".ori/architecture.md",
      "apps/template-app/src/task-management/shared/types/result.ts",
      "apps/template-app/src/task-management/shared/events/event.ts",
      "apps/template-app/src/task-management/shared/contracts/index.ts",
      "apps/template-app/src/task-management/slices/complete-task/index.ts",
      "apps/template-app/src/task-management/slices/complete-task/domain/task.ts",
      "apps/template-app/src/task-management/slices/complete-task/domain/task-id.ts",
      "apps/template-app/src/task-management/slices/complete-task/domain/task-title.ts",
      "apps/template-app/src/task-management/slices/complete-task/domain/events.ts",
      "apps/template-app/src/task-management/slices/complete-task/application/complete-task.ts",
      "apps/template-app/src/task-management/slices/complete-task/presentation/task-card.ts",
      "apps/template-app/src/task-management/slices/complete-task/tests/task.test.ts",
      "apps/template-app/src/ui-widget/task-list/index.ts",
      "apps/template-app/src/ui-page/tasks/index.ts",
      "apps/template-app/src/__tests__/ui-flow.test.ts",
    ];
    for (const rel of expected) {
      await expect(readFile(join(TEMPLATE_ROOT, rel), "utf8")).resolves.toBeTypeOf("string");
    }
  });
});
