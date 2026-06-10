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

const SLICE_INTERNAL_SPEC = `---
version: 1
root:
  app: my-app
  path: apps/my-app/src
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
slice_internal:
  slice-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain,         allow: [] }
      - { from: tests,          allow: [domain, application, infrastructure, presentation] }
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

describe("eslint adapter — slice-internal sub-layer enforcement", () => {
  it("expands slice element pattern to capture subLayer when slice_internal is defined", async () => {
    const content = await render(SLICE_INTERNAL_SPEC);
    // pattern descends one extra level for the sub_layer capture
    expect(content).toContain('"pattern": "src/task-management/slices/*/*/**"');
    // both captures present, in order
    expect(content).toMatch(
      /"capture":\s*\[\s*"sliceName",\s*"subLayer"\s*\]/,
    );
    // and the bare slice pattern is NOT emitted (the wide-open fallback)
    expect(content).not.toContain('"pattern": "src/task-management/slices/*/**"');
  });

  it("emits one boundaries rule per sub_layer with from.captured.subLayer selector", async () => {
    const content = await render(SLICE_INTERNAL_SPEC);
    for (const sub of [
      "domain",
      "application",
      "infrastructure",
      "presentation",
      "tests",
    ]) {
      expect(content).toMatch(
        new RegExp(
          `"from":\\s*\\{\\s*"type":\\s*"domain",\\s*"captured":\\s*\\{\\s*"subLayer":\\s*"${sub}"`,
        ),
      );
    }
  });

  it("encodes presentation → application/domain (same slice) via captured selector", async () => {
    const content = await render(SLICE_INTERNAL_SPEC);
    // The presentation rule must allow domain/application within the same slice
    expect(content).toMatch(
      /"from":\s*\{\s*"type":\s*"domain",\s*"captured":\s*\{\s*"subLayer":\s*"presentation"\s*\}\s*\}[\s\S]*?"to":\s*\{\s*"type":\s*"domain",\s*"captured":\s*\{\s*"sliceName":\s*"\{\{from\.sliceName\}\}",\s*"subLayer":\s*"application"/,
    );
    expect(content).toMatch(
      /"from":\s*\{\s*"type":\s*"domain",\s*"captured":\s*\{\s*"subLayer":\s*"presentation"\s*\}\s*\}[\s\S]*?"subLayer":\s*"domain"/,
    );
  });

  it("forbids domain sub_layer from importing siblings (allow: []) so only cross-layer 'shared' remains", async () => {
    const content = await render(SLICE_INTERNAL_SPEC);
    // pull out the domain.domain block: from.captured.subLayer === "domain"
    const match = content.match(
      /"from":\s*\{\s*"type":\s*"domain",\s*"captured":\s*\{\s*"subLayer":\s*"domain"\s*\}\s*\},\s*"allow":\s*(\[[\s\S]*?\])\s*\}/,
    );
    expect(match, "domain sub_layer rule must be present").not.toBeNull();
    const allow = match![1]!;
    // only `shared` (cross-layer) is allowed; no same-slice sibling allows
    expect(allow).toContain('"type": "shared"');
    expect(allow).not.toContain('"subLayer": "application"');
    expect(allow).not.toContain('"subLayer": "presentation"');
  });

  it("does NOT add a wide 'same slice, any sub_layer' allow entry (the legacy fallback)", async () => {
    const content = await render(SLICE_INTERNAL_SPEC);
    // The legacy fallback emits `"captured": { "sliceName": "{{from.sliceName}}" }`
    // (no subLayer). With slice_internal active, every same-slice allow MUST also
    // pin subLayer, so the trailing `}}"\n<spaces>}` form must never appear.
    expect(content).not.toMatch(
      /"sliceName":\s*"\{\{from\.sliceName\}\}"\s*\n\s*\}/,
    );
  });

  it("leaves slice element pattern flat when slice_internal block is absent (backwards compat)", async () => {
    // TS_SPEC declares slice_internal: slice-internal-ts on the layer but
    // does NOT define the top-level slice_internal block — adapter must fall
    // back to the legacy single-capture form.
    const content = await render(TS_SPEC);
    expect(content).toContain('"pattern": "src/lib/*/**"');
    expect(content).not.toContain('"pattern": "src/lib/*/*/**"');
    expect(content).not.toContain('"subLayer"');
  });

  it("matches the full snapshot for the slice-internal DDD spec (regression net)", async () => {
    const content = await render(SLICE_INTERNAL_SPEC);
    expect(content).toMatchSnapshot();
  });

  it("emits an info note announcing slice-internal sub-layer enforcement is active", async () => {
    const parsed = parseArchitectureSpec(SLICE_INTERNAL_SPEC);
    const result = await adapter.export(parsed, parsed.roots[0]!, {
      templatesDir: TEMPLATES_DIR,
    });
    const notes = result.notes?.join("\n") ?? "";
    expect(notes).toMatch(/Slice-internal sub-layer enforcement is active/);
    expect(notes).toMatch(/\[domain\]/);
  });

  it("warns when a layer declares slice_internal but the matching block is absent", async () => {
    // TS_SPEC declares slice_internal: slice-internal-ts on the layer but
    // the top-level slice_internal block is omitted.
    const parsed = parseArchitectureSpec(TS_SPEC);
    const result = await adapter.export(parsed, parsed.roots[0]!, {
      templatesDir: TEMPLATES_DIR,
    });
    const notes = result.notes?.join("\n") ?? "";
    expect(notes).toMatch(/slice_internal.*?NOT enforced/);
    expect(notes).toMatch(/\[domain\]/);
  });
});
