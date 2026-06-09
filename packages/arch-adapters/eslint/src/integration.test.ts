import { describe, expect, it } from "vitest";
import { parseArchitectureSpec } from "@ori-ori/parser";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import adapter from "./index.js";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  ".apm",
  "contexts",
  "adapters",
  "eslint",
  "templates",
);

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

const FORBIDDEN_SPEC = `---
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

async function render(spec: string): Promise<string> {
  const parsed = parseArchitectureSpec(spec);
  const result = await adapter.export(parsed, parsed.roots[0]!, {
    templatesDir: TEMPLATES_DIR,
  });
  return result.files[0]!.content;
}

describe("eslint adapter — template + injection integration", () => {
  it("renders boundaries config with elements, rules, and capture interpolation", async () => {
    const content = await render(TS_SPEC);
    // header is skill-based, not CLI-based
    expect(content).toContain("Regenerate via the /ori-arch skill");
    expect(content).not.toContain("ori arch export");
    // import boundaries plugin
    expect(content).toContain('import boundaries from "eslint-plugin-boundaries"');
    // file pattern
    expect(content).toContain("src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}");
    // shared element pattern
    expect(content).toContain('"pattern": "src/lib/shared/**"');
    // domain (slice) element with capture
    expect(content).toContain('"pattern": "src/lib/*/**"');
    expect(content).toContain('"sliceName"');
    // ui-layer patterns (literal id as folder name)
    expect(content).toContain('"pattern": "src/ui-entity/**"');
    expect(content).toContain('"pattern": "src/ui-page/**"');
  });

  it("encodes cross-slice isolation via the capture interpolation", async () => {
    const content = await render(TS_SPEC);
    expect(content).toMatch(/"domain"[\s\S]*"sliceName"[\s\S]*"\$\{from\.sliceName\}"/);
  });

  it("orders shared before slice element so overlapping globs resolve correctly", async () => {
    const content = await render(TS_SPEC);
    const sharedIdx = content.indexOf("src/lib/shared/**");
    const sliceIdx = content.indexOf("src/lib/*/**");
    expect(sharedIdx).toBeGreaterThan(0);
    expect(sliceIdx).toBeGreaterThan(0);
    expect(sharedIdx).toBeLessThan(sliceIdx);
  });

  it("respects slice_subdir for the slice element pattern (design.md §17)", async () => {
    const content = await render(SUBDIR_SPEC);
    // BC-internal shared sits beside slices/ (no subdir)
    expect(content).toContain('"pattern": "apps/template-app/src/task-management/shared/**"');
    // slice element matches one level below slices/
    expect(content).toContain('"pattern": "apps/template-app/src/task-management/slices/*/**"');
    // ui-layer patterns stay at root path
    expect(content).toContain('"pattern": "apps/template-app/src/ui-widget/**"');
    expect(content).toContain('"pattern": "apps/template-app/src/ui-page/**"');
  });

  it("emits no-restricted-imports override scoped to forbidden layer files", async () => {
    const content = await render(FORBIDDEN_SPEC);
    expect(content).toContain('"no-restricted-imports"');
    expect(content).toContain("@tauri-apps/api/core");
    expect(content).toContain("tauri-specta-generated");
    // override file glob is the ui-feature layer files
    expect(content).toMatch(/"src\/ui-feature\/\*\*\/\*\.\{ts,tsx,js,jsx,mts,cts,mjs,cjs\}"/);
  });

  it("emits an empty extra-blocks array when forbidden_imports is empty", async () => {
    const minimalSpec = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: m
  adapter: eslint
  slice_root: .
  public_entry: index.ts
layer_sets:
  m:
    layers: [{ id: shared, kind: shared }]
    rules: { cross_layer: [], same_layer: prohibited, public_entry_required: true }
cross_slice: { prohibited_direct: true, via: [] }
---
`;
    const content = await render(minimalSpec);
    expect(content).not.toContain("no-restricted-imports");
    expect(content).toContain("...[]");
  });

  it("matches the full snapshot for the canonical TS spec (regression net)", async () => {
    const content = await render(TS_SPEC);
    expect(content).toMatchSnapshot();
  });
});
