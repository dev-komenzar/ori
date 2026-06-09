import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import adapter from "./index.js";

const SPEC = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: generic
  slice_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: slice }
    rules:
      cross_layer:
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
cross_slice:
  prohibited_direct: true
  via: [shared/contracts]
---
`;

describe("generic adapter — contract", () => {
  it("declares name and supported languages", () => {
    expect(adapter.name).toBe("generic");
    expect(adapter.language).toEqual([
      "typescript",
      "javascript",
      "python",
      "rust",
      "go",
      "java",
    ]);
  });

  it("exports .ori/arch-rules.json with IR-shaped matchers and rules", async () => {
    const spec = parseArchitectureSpec(SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(".ori/arch-rules.json");

    const exported = JSON.parse(result.files[0]!.content);
    expect(exported.version).toBe(1);
    expect(exported.root.path).toBe("src");
    expect(exported.layer_matchers).toEqual([
      { layerId: "shared", kind: "shared", prefix: "src/lib/shared/", slice: false },
      { layerId: "domain", kind: "slice", prefix: "src/lib/", slice: true },
    ]);
    expect(exported.cross_layer_rules).toEqual([
      { from: "domain", allow: ["shared"] },
      { from: "shared", allow: [] },
    ]);
  });

  it("notes mention /ori-arch check invocation (skill-based)", async () => {
    const spec = parseArchitectureSpec(SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);
    expect(result.notes?.join("\n")).toMatch(/\/ori-arch check/);
    expect(result.notes?.join("\n")).not.toMatch(/ori arch check/);
  });
});
