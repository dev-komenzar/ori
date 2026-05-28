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
    // domain (slice) element with capture
    expect(content).toContain("\"pattern\": \"src/lib/*/**\"");
    expect(content).toContain("\"sliceName\"");
    // ui layer patterns (literal id as folder name, v1 convention)
    expect(content).toContain("\"pattern\": \"src/ui-entity/**\"");
    expect(content).toContain("\"pattern\": \"src/ui-page/**\"");
  });

  it("encodes cross-slice isolation via the capture interpolation", async () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);
    const content = result.files[0]!.content;

    // domain → ["domain", { sliceName: "${from.sliceName}" }] must be present
    expect(content).toMatch(/"domain"[\s\S]*"sliceName"[\s\S]*"\$\{from\.sliceName\}"/);
  });

  it("orders shared before slice element so overlapping globs resolve correctly", async () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);
    const content = result.files[0]!.content;

    const sharedIdx = content.indexOf("src/lib/shared/**");
    const sliceIdx = content.indexOf("src/lib/*/**");
    expect(sharedIdx).toBeGreaterThan(0);
    expect(sliceIdx).toBeGreaterThan(0);
    expect(sharedIdx).toBeLessThan(sliceIdx);
  });

  it("skips non-typescript/javascript roots with a note", async () => {
    const spec = parseArchitectureSpec(TS_SPEC);
    const rustRoot = { ...spec.roots[0]!, language: "rust" };
    const result = await adapter.export(spec, rustRoot);

    expect(result.files).toHaveLength(0);
    expect(result.notes?.join("\n")).toMatch(/skipped/);
  });

  describe("slice_subdir (design.md §17 — <bc>/slices/<slice>/)", () => {
    const SPEC_WITH_SUBDIR = `---
version: 1
workspace:
  apps_root: apps
  apps:
    - name: template-app
      path: apps/template-app
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
      - { id: domain,    kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-widget, kind: ui-layer, order: 1 }
      - { id: ui-page,   kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-page,   allow: [ui-widget, shared, domain] }
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

    it("emits slice pattern with the subdir level (apps/<app>/src/<bc>/slices/*/**)", async () => {
      const spec = parseArchitectureSpec(SPEC_WITH_SUBDIR);
      const result = await adapter.export(spec, spec.roots[0]!);
      const content = result.files[0]!.content;
      // BC-internal shared sits beside slices/ — no subdir
      expect(content).toContain(
        "\"pattern\": \"apps/template-app/src/task-management/shared/**\"",
      );
      // slice element matches one level below slices/
      expect(content).toContain(
        "\"pattern\": \"apps/template-app/src/task-management/slices/*/**\"",
      );
      // ui-layer patterns stay at root path
      expect(content).toContain(
        "\"pattern\": \"apps/template-app/src/ui-widget/**\"",
      );
      expect(content).toContain(
        "\"pattern\": \"apps/template-app/src/ui-page/**\"",
      );
    });
  });

  describe("forbidden_imports → no-restricted-imports", () => {
    const SPEC_WITH_FORBIDDEN = `---
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
      - { id: shared, kind: shared }
      - { id: domain, kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-feature, kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-feature, allow: [shared, domain] }
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
      forbidden_imports:
        - from: ui-feature
          modules: ["@tauri-apps/api/core"]
          reason: "use lib/shared/ipc/* (tauri-specta-generated) instead of raw invoke"
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---
`;

    it("emits a no-restricted-imports override scoped to the matching layer's files", async () => {
      const spec = parseArchitectureSpec(SPEC_WITH_FORBIDDEN);
      const result = await adapter.export(spec, spec.roots[0]!);
      const content = result.files[0]!.content;

      expect(content).toContain("\"no-restricted-imports\"");
      // ui-feature layer is a ui-layer kind → glob is `<root.path>/ui-feature/**`
      expect(content).toMatch(
        /files: \["src\/ui-feature\/\*\*\/\*\.\{ts,tsx,js,jsx,mts,cts,mjs,cjs\}"\][\s\S]*"no-restricted-imports"/,
      );
      expect(content).toContain("@tauri-apps/api/core");
    });

    it("surfaces the reason string as the per-path message", async () => {
      const spec = parseArchitectureSpec(SPEC_WITH_FORBIDDEN);
      const result = await adapter.export(spec, spec.roots[0]!);
      const content = result.files[0]!.content;

      expect(content).toContain("tauri-specta-generated");
    });

    it("emits no extra no-restricted-imports block when forbidden_imports is empty", async () => {
      const spec = parseArchitectureSpec(`---
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
    rules:
      cross_layer: []
      same_layer: prohibited
      public_entry_required: true
cross_slice: { prohibited_direct: true, via: [] }
---
`);
      const result = await adapter.export(spec, spec.roots[0]!);
      const content = result.files[0]!.content;
      expect(content).not.toContain("no-restricted-imports");
    });
  });
});
