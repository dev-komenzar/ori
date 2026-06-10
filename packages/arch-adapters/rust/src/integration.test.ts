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

const SUBDIR_SPEC = `---
version: 1
root:
  app: template-app
  path: apps/template-app/src-tauri/src
  language: rust
  layer_set: ddd-vsa-hex-rs
  adapter: rust
  slice_root: task-management
  slice_subdir: slices
  public_entry: mod.rs
layer_sets:
  ddd-vsa-hex-rs:
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

async function render(spec: string): Promise<string> {
  const parsed = parseArchitectureSpec(spec);
  const root = parsed.roots.find((r) => r.language === "rust") ?? parsed.roots[0]!;
  const result = await adapter.export(parsed, root, { templatesDir: TEMPLATES_DIR });
  return result.files[0]!.content;
}

describe("rust adapter — template + injection integration", () => {
  it("renders #[test] fn with constants and matchers", async () => {
    const content = await render(SINGLE_CRATE_SPEC);
    // skill-based header replaces the old CLI hint
    expect(content).toContain("Regenerate via the /ori-arch skill");
    expect(content).not.toContain("ori arch export");
    // constants
    expect(content).toContain('const ROOT_PATH: &str = "src"');
    expect(content).toContain('const PUBLIC_ENTRY: &str = "mod.rs"');
    expect(content).toContain("const CROSS_SLICE_PROHIBITED: bool = true");
    // test function
    expect(content).toContain("#[test]");
    expect(content).toContain("fn architecture_rules()");
  });

  it("emits MATCHERS entries with slice flags reflecting parser IR", async () => {
    const content = await render(SINGLE_CRATE_SPEC);
    // shared matcher: slice false
    expect(content).toMatch(/layer_id: "shared"[\s\S]*?slice: false/);
    // domain matcher: slice true
    expect(content).toMatch(/layer_id: "domain"[\s\S]*?slice: true/);
    // ordering: shared first, slice last
    const sharedIdx = content.indexOf('layer_id: "shared"');
    const domainIdx = content.indexOf('layer_id: "domain"');
    expect(sharedIdx).toBeLessThan(domainIdx);
  });

  it("emits CROSS_LAYER_RULES from the spec", async () => {
    const content = await render(SINGLE_CRATE_SPEC);
    expect(content).toContain('("domain", &["shared"])');
    expect(content).toContain('("shared", &[])');
  });

  it("respects slice_subdir for the slice prefix (design.md §17)", async () => {
    const content = await render(SUBDIR_SPEC);
    expect(content).toContain(
      'layer_id: "domain", kind: "slice", prefix: "apps/template-app/src-tauri/src/task-management/slices/", slice: true',
    );
    expect(content).toContain(
      'layer_id: "shared", kind: "shared", prefix: "apps/template-app/src-tauri/src/task-management/shared/"',
    );
    expect(content).toContain(
      'const SLICE_BASE: &str = "apps/template-app/src-tauri/src/task-management/"',
    );
  });

  it("retains the mod.rs-aware super:: resolver from the template (regression for ori-w5j)", async () => {
    const content = await render(SINGLE_CRATE_SPEC);
    expect(content).toContain("fn parent_module_dir(importer: &Path)");
    expect(content).toContain("fn module_dir(importer: &Path)");
    expect(content).toContain('importer.file_name().and_then(|s| s.to_str()) == Some("mod.rs")');
    // super:: resolver must use parent_module_dir
    expect(content).toMatch(
      /target\.strip_prefix\("super::"\)[\s\S]*?parent_module_dir\(importer\)/,
    );
    expect(content).not.toMatch(
      /target\.strip_prefix\("super::"\)[\s\S]*?importer\.parent\(\)\?\.parent\(\)\?/,
    );
  });

  it("matches the full snapshot for the single-crate spec (regression net)", async () => {
    const content = await render(SINGLE_CRATE_SPEC);
    expect(content).toMatchSnapshot();
  });
});
