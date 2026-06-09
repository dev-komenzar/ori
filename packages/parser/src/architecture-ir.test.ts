import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "./architecture.js";
import { buildBridges, buildMatchers, buildRules } from "./architecture-ir.js";

const TS_SPEC = `---
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
    layers:
      - { id: shared,     kind: shared }
      - { id: domain,     kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-entity,  kind: ui-layer, order: 1 }
      - { id: ui-feature, kind: ui-layer, order: 2 }
      - { id: ui-widget,  kind: ui-layer, order: 3 }
      - { id: ui-page,    kind: ui-layer, order: 4 }
    rules:
      cross_layer:
        - { from: ui-page,    allow: [ui-widget, ui-feature, ui-entity, shared, domain] }
        - { from: ui-widget,  allow: [ui-feature, ui-entity, shared, domain] }
        - { from: ui-feature, allow: [ui-entity, shared, domain] }
        - { from: ui-entity,  allow: [shared, domain] }
        - { from: domain,     allow: [shared] }
        - { from: shared,     allow: [] }
      same_layer: prohibited
      public_entry_required: true
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---
`;

const RUST_SPEC = `---
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

const SUBDIR_SPEC = `---
version: 1
root:
  app: template-app
  path: apps/template-app/src
  language: typescript
  layer_set: ddd-vsa-hex-ts
  adapter: eslint
  slice_root: task-management
  slice_subdir: slices
  public_entry: index.ts
layer_sets:
  ddd-vsa-hex-ts:
    layers:
      - { id: shared,    kind: shared }
      - { id: domain,    kind: slice }
      - { id: ui-widget, kind: ui-layer, order: 1 }
    rules:
      cross_layer:
        - { from: ui-widget, allow: [shared, domain] }
        - { from: domain,    allow: [shared] }
        - { from: shared,    allow: [] }
      same_layer: prohibited
      public_entry_required: true
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---
`;

describe("buildMatchers", () => {
  it("emits shared/ui-layer matchers before slice matchers (order matters for overlapping globs)", () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const matchers = buildMatchers(spec, spec.roots[0]!);
    const ids = matchers.map((m) => m.layerId);
    // shared and ui-layers come first, slice last
    expect(ids).toEqual([
      "shared",
      "ui-entity",
      "ui-feature",
      "ui-widget",
      "ui-page",
      "domain",
    ]);
  });

  it("computes shared prefix as <root.path>/<slice_root>/<layer>/", () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const matchers = buildMatchers(spec, spec.roots[0]!);
    const shared = matchers.find((m) => m.layerId === "shared")!;
    expect(shared).toEqual({
      layerId: "shared",
      kind: "shared",
      prefix: "src/lib/shared/",
      slice: false,
    });
  });

  it("computes ui-layer prefix as <root.path>/<layer>/ (no slice_root)", () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const matchers = buildMatchers(spec, spec.roots[0]!);
    const ui = matchers.find((m) => m.layerId === "ui-page")!;
    expect(ui).toEqual({
      layerId: "ui-page",
      kind: "ui-layer",
      prefix: "src/ui-page/",
      slice: false,
    });
  });

  it("flags slice matchers with slice: true", () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const matchers = buildMatchers(spec, spec.roots[0]!);
    const domain = matchers.find((m) => m.layerId === "domain")!;
    expect(domain).toEqual({
      layerId: "domain",
      kind: "slice",
      prefix: "src/lib/",
      slice: true,
    });
  });

  it("handles slice_root='.' (rust convention) by collapsing to root.path", () => {
    const spec = parseArchitectureSpec(RUST_SPEC);
    const matchers = buildMatchers(spec, spec.roots[0]!);
    const shared = matchers.find((m) => m.layerId === "shared")!;
    const domain = matchers.find((m) => m.layerId === "domain")!;
    expect(shared.prefix).toBe("src/shared/");
    expect(domain.prefix).toBe("src/");
  });

  it("respects slice_subdir (design.md §17) on slice matcher prefix only", () => {
    const spec = parseArchitectureSpec(SUBDIR_SPEC);
    const matchers = buildMatchers(spec, spec.roots[0]!);
    const shared = matchers.find((m) => m.layerId === "shared")!;
    const domain = matchers.find((m) => m.layerId === "domain")!;
    // shared sits at <bc>/shared/ (sibling of slices/, no subdir)
    expect(shared.prefix).toBe("apps/template-app/src/task-management/shared/");
    // slice prefix descends into slices/
    expect(domain.prefix).toBe("apps/template-app/src/task-management/slices/");
  });

  it("throws when layer_set is missing", () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const root = { ...spec.roots[0]!, layer_set: "does-not-exist" };
    expect(() => buildMatchers(spec, root)).toThrow(/layer_set/);
  });
});

describe("buildRules", () => {
  it("maps cross_layer entries to a flat allow-list", () => {
    const spec = parseArchitectureSpec(RUST_SPEC);
    const rules = buildRules(spec, spec.roots[0]!);
    expect(rules).toEqual([
      { from: "domain", allow: ["shared"] },
      { from: "shared", allow: [] },
    ]);
  });

  it("preserves rule order from the spec", () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const rules = buildRules(spec, spec.roots[0]!);
    expect(rules.map((r) => r.from)).toEqual([
      "ui-page",
      "ui-widget",
      "ui-feature",
      "ui-entity",
      "domain",
      "shared",
    ]);
  });
});

describe("buildBridges", () => {
  it("emits one bridge per (slice-layer, via-path) pair from cross_slice.via", () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const bridges = buildBridges(spec, spec.roots[0]!);
    // domain is the only slice layer × 2 bridges = 2 entries
    expect(bridges).toEqual([
      { from: "domain", via: "shared/contracts" },
      { from: "domain", via: "shared/events" },
    ]);
  });

  it("returns empty when cross_slice.via is empty", () => {
    const spec = parseArchitectureSpec(`---
version: 1
root:
  path: src
  language: typescript
  layer_set: minimal
  adapter: eslint
  slice_root: .
  public_entry: index.ts
layer_sets:
  minimal:
    layers: [{ id: shared, kind: shared }]
    rules: { cross_layer: [], same_layer: prohibited, public_entry_required: true }
cross_slice:
  prohibited_direct: true
  via: []
---
`);
    expect(buildBridges(spec, spec.roots[0]!)).toEqual([]);
  });
});
