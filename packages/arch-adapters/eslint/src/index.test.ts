import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import adapter from "./index.js";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
);

const MINIMAL_SPEC = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  slice_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers: [{ id: shared, kind: shared }]
    rules: { cross_layer: [], same_layer: prohibited, public_entry_required: true }
cross_slice:
  prohibited_direct: true
  via: []
---
`;

describe("eslint adapter — contract", () => {
  it("declares name and language", () => {
    expect(adapter.name).toBe("eslint");
    expect(adapter.language).toEqual(["typescript", "javascript"]);
  });

  it("emits eslint.config.ori.js as the output file path", async () => {
    const spec = parseArchitectureSpec(MINIMAL_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!, {
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("eslint.config.ori.js");
  });

  it("skips non-typescript/javascript roots with a note", async () => {
    const spec = parseArchitectureSpec(MINIMAL_SPEC);
    const rustRoot = { ...spec.roots[0]!, language: "rust" };
    const result = await adapter.export(spec, rustRoot, {
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.files).toHaveLength(0);
    expect(result.notes?.join("\n")).toMatch(/skipped/);
  });

  it("includes peer install hint in notes", async () => {
    const spec = parseArchitectureSpec(MINIMAL_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!, {
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.notes?.join("\n")).toMatch(/pnpm add -D eslint/);
  });
});
