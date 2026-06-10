import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import adapter from "./index.js";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
);

const SINGLE_CRATE_SPEC = `---
version: 1
root:
  path: src
  language: rust
  layer_set: feature-sliced-rs
  adapter: rust
  slice_root: .
  public_entry: mod.rs
layer_sets:
  feature-sliced-rs:
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

const TAURI_SPEC = `---
version: 1
roots:
  - id: ts
    path: src
    language: typescript
    layer_set: feature-sliced-ts
    adapter: eslint
    slice_root: lib
    public_entry: index.ts
  - id: rs
    path: src-tauri/src
    language: rust
    layer_set: feature-sliced-rs
    adapter: rust
    slice_root: .
    public_entry: mod.rs
layer_sets:
  feature-sliced-ts:
    layers: [{ id: shared, kind: shared }]
    rules: { cross_layer: [], same_layer: prohibited, public_entry_required: true }
  feature-sliced-rs:
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

describe("rust adapter — contract", () => {
  it("declares name and language", () => {
    expect(adapter.name).toBe("rust");
    expect(adapter.language).toBe("rust");
  });

  it("places output under <crate-root>/tests/ for single-crate (root.path=src)", async () => {
    const spec = parseArchitectureSpec(SINGLE_CRATE_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!, {
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("./tests/arch.rs");
  });

  it("places output under <crate-root>/tests/ for a Tauri layout (root.path=src-tauri/src)", async () => {
    const spec = parseArchitectureSpec(TAURI_SPEC);
    const rsRoot = spec.roots.find((r) => r.id === "rs")!;
    const result = await adapter.export(spec, rsRoot, {
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.files[0]?.path).toBe("src-tauri/tests/arch.rs");
  });

  it("skips non-rust roots with a note", async () => {
    const spec = parseArchitectureSpec(TAURI_SPEC);
    const tsRoot = spec.roots.find((r) => r.id === "ts")!;
    const result = await adapter.export(spec, tsRoot, {
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.files).toHaveLength(0);
    expect(result.notes?.join("\n")).toMatch(/skipped/);
  });

  it("includes cargo test hint in notes", async () => {
    const spec = parseArchitectureSpec(SINGLE_CRATE_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!, {
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.notes?.join("\n")).toMatch(/cargo test --test arch/);
  });
});
