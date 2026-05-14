import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "./architecture.js";

const SINGLE_ROOT_SPEC = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: feature, feature_internal: feature-internal-ts }
    rules:
      cross_layer:
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
feature_internal:
  feature-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation, allow: [application, domain] }
cross_feature:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---

## Layer rationale

prose
`;

describe("parseArchitectureSpec", () => {
  it("normalizes single-root shorthand into roots[]", () => {
    const spec = parseArchitectureSpec(SINGLE_ROOT_SPEC);

    expect(spec.version).toBe(1);
    expect(spec.roots).toHaveLength(1);
    expect(spec.roots[0]?.id).toBe("default");
    expect(spec.roots[0]?.path).toBe("src");
    expect(spec.roots[0]?.adapter).toBe("eslint");
    expect(spec.default_root).toBe("default");
  });

  it("preserves the Markdown body for downstream consumers", () => {
    const spec = parseArchitectureSpec(SINGLE_ROOT_SPEC);
    expect(spec.body).toContain("## Layer rationale");
  });

  it("parses multi-root with cross_root bridges", () => {
    const raw = `---
version: 1
roots:
  - id: ts
    path: src
    language: typescript
    layer_set: feature-sliced-ts
    adapter: eslint
    feature_root: lib
    public_entry: index.ts
  - id: rs
    path: src-tauri/src
    language: rust
    layer_set: feature-sliced-rs
    adapter: rust
    feature_root: .
    public_entry: mod.rs
cross_root:
  - from: { root: rs, path: shared/contracts }
    to: { root: ts, path: lib/shared/ipc }
    generator: tauri-specta
    auto_generated: true
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared, kind: shared }
    rules:
      cross_layer: []
      same_layer: prohibited
      public_entry_required: true
  feature-sliced-rs:
    layers:
      - { id: shared, kind: shared }
    rules:
      cross_layer: []
      same_layer: prohibited
      public_entry_required: true
cross_feature:
  prohibited_direct: true
  via: [shared/contracts]
---
`;
    const spec = parseArchitectureSpec(raw);

    expect(spec.roots.map((r) => r.id)).toEqual(["ts", "rs"]);
    expect(spec.cross_root).toHaveLength(1);
    expect(spec.cross_root[0]?.auto_generated).toBe(true);
    expect(spec.default_root).toBe("ts");
  });

  it("fails loudly when neither root nor roots[] is present", () => {
    const raw = `---
version: 1
layer_sets: {}
cross_feature: { prohibited_direct: true, via: [] }
---
`;
    expect(() => parseArchitectureSpec(raw)).toThrow();
  });

  it("fails loudly when version is missing", () => {
    const raw = `---
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers: [{ id: shared, kind: shared }]
    rules: { cross_layer: [], same_layer: prohibited, public_entry_required: true }
cross_feature: { prohibited_direct: true, via: [] }
---
`;
    expect(() => parseArchitectureSpec(raw)).toThrow();
  });

  describe("forbidden_imports", () => {
    it("defaults to an empty array when absent (backwards compatible)", () => {
      const spec = parseArchitectureSpec(SINGLE_ROOT_SPEC);
      const set = spec.layer_sets["feature-sliced-ts"]!;
      expect(set.rules.forbidden_imports).toEqual([]);
    });

    it("accepts an explicitly empty forbidden_imports list", () => {
      const raw = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers: [{ id: shared, kind: shared }]
    rules:
      cross_layer: []
      same_layer: prohibited
      public_entry_required: true
      forbidden_imports: []
cross_feature: { prohibited_direct: true, via: [] }
---
`;
      const spec = parseArchitectureSpec(raw);
      expect(spec.layer_sets["feature-sliced-ts"]!.rules.forbidden_imports).toEqual([]);
    });

    it("parses forbidden_imports entries with from/modules/reason", () => {
      const raw = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared, kind: shared }
      - { id: ui-feature, kind: ui-layer }
    rules:
      cross_layer: []
      same_layer: prohibited
      public_entry_required: true
      forbidden_imports:
        - from: ui-feature
          modules: ["@tauri-apps/api/core"]
          reason: "use lib/shared/ipc/* (tauri-specta-generated) instead of raw invoke"
cross_feature: { prohibited_direct: true, via: [] }
---
`;
      const spec = parseArchitectureSpec(raw);
      const fis = spec.layer_sets["feature-sliced-ts"]!.rules.forbidden_imports;
      expect(fis).toHaveLength(1);
      expect(fis[0]).toMatchObject({
        from: "ui-feature",
        modules: ["@tauri-apps/api/core"],
        reason: expect.stringContaining("tauri-specta"),
      });
    });

    it("rejects forbidden_imports entries with an empty modules array", () => {
      const raw = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers: [{ id: shared, kind: shared }]
    rules:
      cross_layer: []
      same_layer: prohibited
      public_entry_required: true
      forbidden_imports:
        - from: ui-feature
          modules: []
cross_feature: { prohibited_direct: true, via: [] }
---
`;
      expect(() => parseArchitectureSpec(raw)).toThrow();
    });

    it("rejects forbidden_imports entries missing required fields", () => {
      const raw = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers: [{ id: shared, kind: shared }]
    rules:
      cross_layer: []
      same_layer: prohibited
      public_entry_required: true
      forbidden_imports:
        - modules: ["@tauri-apps/api/core"]
cross_feature: { prohibited_direct: true, via: [] }
---
`;
      expect(() => parseArchitectureSpec(raw)).toThrow();
    });
  });

  it("rejects default_root that does not match any root id", () => {
    const raw = `---
version: 1
default_root: nope
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers: [{ id: shared, kind: shared }]
    rules: { cross_layer: [], same_layer: prohibited, public_entry_required: true }
cross_feature: { prohibited_direct: true, via: [] }
---
`;
    expect(() => parseArchitectureSpec(raw)).toThrow(/default_root/);
  });
});
