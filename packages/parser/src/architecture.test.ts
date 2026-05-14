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
