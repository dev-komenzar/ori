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

async function renderResult(spec: string) {
  const parsed = parseArchitectureSpec(spec);
  return adapter.export(parsed, parsed.roots[0]!, {
    templatesDir: TEMPLATES_DIR,
  });
}

describe("eslint adapter — template + injection integration", () => {
  it("renders boundaries v6 dependencies rule with elements and capture interpolation", async () => {
    const content = await render(TS_SPEC);
    expect(content).toContain("Regenerate via the /ori-arch skill");
    expect(content).not.toContain("ori arch export");
    expect(content).toContain('import boundaries from "eslint-plugin-boundaries"');
    // v6 rule name
    expect(content).toContain('"boundaries/dependencies"');
    expect(content).not.toContain('"boundaries/element-types"');
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

  it("emits object-based selectors (v6) for from/allow with handlebars capture template", async () => {
    const content = await render(TS_SPEC);
    // v6 from selector is object form
    expect(content).toContain('"from": {');
    expect(content).toContain('"type": "domain"');
    // v6 allow entries are wrapped in `to: { type, captured? }`
    expect(content).toMatch(/"allow":\s*\[/);
    expect(content).toMatch(/"to":\s*\{/);
    // capture interpolation uses handlebars syntax (no `${...}` legacy)
    expect(content).toContain("{{from.sliceName}}");
    expect(content).not.toContain("${from.sliceName}");
  });

  it("encodes cross-slice isolation via the captured-values selector", async () => {
    const content = await render(TS_SPEC);
    // The domain rule must include an allow entry that re-targets domain with capture
    expect(content).toMatch(
      /"from":\s*\{\s*"type":\s*"domain"\s*\}[\s\S]*?"to":\s*\{\s*"type":\s*"domain"[\s\S]*?"sliceName":\s*"\{\{from\.sliceName\}\}"/,
    );
  });

  it("orders shared before slice element so overlapping globs resolve correctly", async () => {
    const content = await render(TS_SPEC);
    const sharedIdx = content.indexOf("src/lib/shared/**");
    const sliceIdx = content.indexOf("src/lib/*/**");
    expect(sharedIdx).toBeGreaterThan(0);
    expect(sliceIdx).toBeGreaterThan(0);
    expect(sharedIdx).toBeLessThan(sliceIdx);
  });

  it("emits app-relative file and element patterns when root.app is set", async () => {
    const result = await renderResult(SUBDIR_SPEC);
    expect(result.files).toHaveLength(1);
    // output is placed in the app dir, not at repo root
    expect(result.files[0]?.path).toBe("apps/template-app/eslint.config.ori.js");
    const content = result.files[0]!.content;
    // file pattern is app-relative (no apps/<app>/ prefix)
    expect(content).toContain('"src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}"');
    expect(content).not.toContain("apps/template-app/src/**/*.{ts");
    // element patterns are app-relative
    expect(content).toContain('"pattern": "src/task-management/shared/**"');
    expect(content).toContain('"pattern": "src/task-management/slices/*/**"');
    expect(content).toContain('"pattern": "src/ui-widget/**"');
    expect(content).toContain('"pattern": "src/ui-page/**"');
    // and never carry the absolute prefix
    expect(content).not.toContain("apps/template-app/src/task-management");
    expect(content).not.toContain("apps/template-app/src/ui-");
  });

  it("emits a hint note about the app-dir-relative output location", async () => {
    const result = await renderResult(SUBDIR_SPEC);
    const notes = result.notes?.join("\n") ?? "";
    expect(notes).toMatch(/apps\/template-app\/eslint\.config\.ori\.js/);
  });

  it("emits no-restricted-imports override scoped to forbidden layer files", async () => {
    const content = await render(FORBIDDEN_SPEC);
    expect(content).toContain('"no-restricted-imports"');
    expect(content).toContain("@tauri-apps/api/core");
    expect(content).toContain("tauri-specta-generated");
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
