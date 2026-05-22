import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import eslintAdapter from "@ori-ori/arch-adapter-eslint";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = join(__dirname, "..", "ddd-typescript");

describe("ddd-typescript template", () => {
  it("includes a parsable .ori/architecture.md", async () => {
    const raw = await readFile(join(TEMPLATE_ROOT, ".ori/architecture.md"), "utf8");
    const spec = parseArchitectureSpec(raw);
    expect(spec.version).toBe(1);
    expect(spec.cross_slice.prohibited_direct).toBe(true);
    expect(spec.roots[0]?.slice_root).toBe("lib");
  });

  it("produces an eslint config via the eslint adapter", async () => {
    const raw = await readFile(join(TEMPLATE_ROOT, ".ori/architecture.md"), "utf8");
    const spec = parseArchitectureSpec(raw);
    const result = await eslintAdapter.export(spec, spec.roots[0]!);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("eslint.config.ori.js");
    const content = result.files[0]!.content;
    expect(content).toContain("eslint-plugin-boundaries");
    expect(content).toContain("src/lib/shared/**");
    expect(content).toContain("src/lib/*/**");
  });

  it("encodes the FSD UI layers in the generated eslint config", async () => {
    const raw = await readFile(join(TEMPLATE_ROOT, ".ori/architecture.md"), "utf8");
    const spec = parseArchitectureSpec(raw);
    const result = await eslintAdapter.export(spec, spec.roots[0]!);
    const content = result.files[0]!.content;

    // Each UI layer appears as a literal-id element.
    for (const id of ["ui-entity", "ui-feature", "ui-widget", "ui-page"]) {
      expect(content).toContain(`"pattern": "src/${id}/**"`);
    }

    // ui-feature is the only UI layer allowed to import a domain feature.
    expect(content).toMatch(/"from":\s*\[\s*"ui-feature"\s*\][\s\S]*"domain"/);
    // ui-entity must NOT list "domain" in its allow set.
    const uiEntityRule = content.match(
      /"from":\s*\[\s*"ui-entity"\s*\],\s*"allow":\s*\[([^\]]*)\]/,
    );
    expect(uiEntityRule).not.toBeNull();
    expect(uiEntityRule?.[1]).not.toContain("domain");
  });

  it("ships the canonical scaffolding files", async () => {
    const expected = [
      "README.md",
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "eslint.config.js",
      ".ori/architecture.md",
      "src/lib/shared/types/result.ts",
      "src/lib/shared/events/event.ts",
      "src/lib/shared/contracts/index.ts",
      "src/lib/tasks/index.ts",
      "src/lib/tasks/domain/task.ts",
      "src/lib/tasks/domain/task-id.ts",
      "src/lib/tasks/domain/task-title.ts",
      "src/lib/tasks/domain/events.ts",
      "src/lib/tasks/tests/task.test.ts",
      "src/ui-entity/task-card/index.ts",
      "src/ui-feature/complete-task/index.ts",
      "src/ui-widget/task-list/index.ts",
      "src/ui-page/tasks/index.ts",
      "src/__tests__/ui-flow.test.ts",
    ];
    for (const rel of expected) {
      await expect(readFile(join(TEMPLATE_ROOT, rel), "utf8")).resolves.toBeTypeOf("string");
    }
  });
});
