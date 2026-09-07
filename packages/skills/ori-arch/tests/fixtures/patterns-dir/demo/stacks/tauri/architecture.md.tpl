---
version: 1
workspace:
  apps_root: apps
  apps:
    - name: {{APP_NAME}}
      path: apps/{{APP_NAME}}
      runtime:
        mode: local
        build: pnpm tauri build --debug --no-bundle
        binary: apps/{{APP_NAME}}/src-tauri/target/debug/{{APP_NAME}}
        target: host
        runner: wdio
roots:
  - id: ts
    app: {{APP_NAME}}
    path: apps/{{APP_NAME}}/src
    language: typescript
    layer_set: ddd-vsa-hex-ts
    adapter: eslint
    slice_root: {{BC_NAME}}
    slice_subdir: slices
    public_entry: index.ts
  - id: rs
    app: {{APP_NAME}}
    path: apps/{{APP_NAME}}/src-tauri/src
    language: rust
    layer_set: ddd-vsa-hex-rs
    adapter: rust
    slice_root: {{BC_NAME_RS}}
    slice_subdir: slices
    public_entry: mod.rs
layer_sets:
  ddd-vsa-hex-ts:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-widget, kind: ui-layer, order: 1 }
      - { id: ui-page, kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-page, allow: [ui-widget, shared, domain] }
        - { from: ui-widget, allow: [shared, domain] }
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
  ddd-vsa-hex-rs:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: slice, slice_internal: slice-internal-rs }
    rules:
      cross_layer:
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
slice_internal:
  slice-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation, allow: [application, domain] }
      - { from: application, allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain, allow: [] }
      - { from: tests, allow: [domain, application, infrastructure, presentation] }
  slice-internal-rs:
    sub_layers: [domain, application, infrastructure, presentation]
    rules:
      - { from: presentation, allow: [application, domain] }
      - { from: application, allow: [domain, infrastructure] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain, allow: [] }
cross_root:
  - from: { root: rs, path: shared/contracts }
    to: { root: ts, path: '{{BC_NAME}}/types' }
    generator: tauri-specta
    auto_generated: true
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---

## Layer rationale

demo tauri stack (runtime block 付き — ori-bc9.3 data-driven injection 検証用)
