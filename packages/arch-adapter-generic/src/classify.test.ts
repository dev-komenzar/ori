import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import { buildMatchers, classify } from "./classify.js";

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
      - { id: shared,    kind: shared }
      - { id: domain,    kind: slice }
      - { id: ui-entity, kind: ui-layer, order: 1 }
    rules:
      cross_layer:
        - { from: ui-entity, allow: [shared, domain] }
        - { from: domain,    allow: [shared] }
        - { from: shared,    allow: [] }
      same_layer: prohibited
      public_entry_required: true
cross_slice:
  prohibited_direct: true
  via: [shared/contracts]
---
`;

describe("classify", () => {
  it("matches shared layer files", () => {
    const spec = parseArchitectureSpec(SPEC);
    const m = buildMatchers(spec, spec.roots[0]!);
    const hit = classify("src/lib/shared/contracts/foo.ts", m);
    expect(hit?.layerId).toBe("shared");
    expect(hit?.kind).toBe("shared");
  });

  it("matches slice layer files and captures sliceName", () => {
    const spec = parseArchitectureSpec(SPEC);
    const m = buildMatchers(spec, spec.roots[0]!);
    const hit = classify("src/lib/orders/application/place-order.ts", m);
    expect(hit?.layerId).toBe("domain");
    expect(hit?.kind).toBe("slice");
    expect(hit?.sliceName).toBe("orders");
  });

  it("prefers shared over slice when paths overlap", () => {
    const spec = parseArchitectureSpec(SPEC);
    const m = buildMatchers(spec, spec.roots[0]!);
    const hit = classify("src/lib/shared/events/event-bus.ts", m);
    expect(hit?.layerId).toBe("shared");
  });

  it("matches ui-layer at <root.path>/<id>/**", () => {
    const spec = parseArchitectureSpec(SPEC);
    const m = buildMatchers(spec, spec.roots[0]!);
    const hit = classify("src/ui-entity/prompt-card/index.tsx", m);
    expect(hit?.layerId).toBe("ui-entity");
    expect(hit?.kind).toBe("ui-layer");
  });

  it("returns null for unrelated paths", () => {
    const spec = parseArchitectureSpec(SPEC);
    const m = buildMatchers(spec, spec.roots[0]!);
    expect(classify("node_modules/react/index.js", m)).toBeNull();
    expect(classify("src/lib/foo.ts", m)).toBeNull(); // file directly under slice_root
  });
});
