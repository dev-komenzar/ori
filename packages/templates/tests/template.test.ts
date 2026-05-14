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
    expect(spec.cross_feature.prohibited_direct).toBe(true);
    expect(spec.roots[0]?.feature_root).toBe("lib");
  });

  it("produces an eslint config via the eslint adapter", async () => {
    const raw = await readFile(join(TEMPLATE_ROOT, ".ori/architecture.md"), "utf8");
    const spec = parseArchitectureSpec(raw);
    const result = await eslintAdapter.export(spec, spec.roots[0]!);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("eslint.config.ori.js");
    expect(result.files[0]?.content).toContain("eslint-plugin-boundaries");
    expect(result.files[0]?.content).toContain("src/lib/shared/**");
    expect(result.files[0]?.content).toContain("src/lib/*/**");
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
    ];
    for (const rel of expected) {
      await expect(readFile(join(TEMPLATE_ROOT, rel), "utf8")).resolves.toBeTypeOf("string");
    }
  });
});
