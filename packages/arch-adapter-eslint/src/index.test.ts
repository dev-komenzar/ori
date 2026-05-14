import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import adapter from "./index.js";

const TS_SPEC = `---
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
      - { id: shared,     kind: shared }
      - { id: domain,     kind: feature, feature_internal: feature-internal-ts }
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
cross_feature:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---
`;

describe("@ori-ori/arch-adapter-eslint", () => {
  it("declares the adapter contract", () => {
    expect(adapter.name).toBe("eslint");
    expect(Array.isArray(adapter.language)).toBe(true);
  });

  it("emits eslint.config.ori.js with boundaries elements and rules", async () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("eslint.config.ori.js");

    const content = result.files[0]!.content;
    expect(content).toContain("import boundaries from \"eslint-plugin-boundaries\"");
    expect(content).toContain("src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}");

    // shared element pattern
    expect(content).toContain("\"pattern\": \"src/lib/shared/**\"");
    // domain (feature) element with capture
    expect(content).toContain("\"pattern\": \"src/lib/*/**\"");
    expect(content).toContain("\"featureName\"");
    // ui layer patterns (literal id as folder name, v1 convention)
    expect(content).toContain("\"pattern\": \"src/ui-entity/**\"");
    expect(content).toContain("\"pattern\": \"src/ui-page/**\"");
  });

  it("encodes cross-feature isolation via the capture interpolation", async () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);
    const content = result.files[0]!.content;

    // domain → ["domain", { featureName: "${from.featureName}" }] must be present
    expect(content).toMatch(/"domain"[\s\S]*"featureName"[\s\S]*"\$\{from\.featureName\}"/);
  });

  it("orders shared before feature element so overlapping globs resolve correctly", async () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);
    const content = result.files[0]!.content;

    const sharedIdx = content.indexOf("src/lib/shared/**");
    const featureIdx = content.indexOf("src/lib/*/**");
    expect(sharedIdx).toBeGreaterThan(0);
    expect(featureIdx).toBeGreaterThan(0);
    expect(sharedIdx).toBeLessThan(featureIdx);
  });

  it("skips non-typescript/javascript roots with a note", async () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const rustRoot = { ...spec.roots[0]!, language: "rust" };
    const result = await adapter.export(spec, rustRoot);

    expect(result.files).toHaveLength(0);
    expect(result.notes?.join("\n")).toMatch(/skipped/);
  });
});
