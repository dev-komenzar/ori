---
version: 1
default_root: ts
workspace:
  apps_root: apps
  apps:
    - name: myapp
      path: apps/myapp
roots:
  - id: ts
    app: myapp
    path: apps/myapp/src
    language: typescript
    layer_set: ddd-vsa-hex-ts
    adapter: eslint
    slice_root: task-management
    slice_subdir: slices
    public_entry: index.ts
  - id: rs
    app: myapp
    path: apps/myapp/src-tauri/src
    language: rust
    layer_set: ddd-vsa-hex-rs
    adapter: rust
    slice_root: task_management
    slice_subdir: slices
    public_entry: mod.rs
cross_root:
  - from: { root: rs, path: apps/myapp/src-tauri/src/task_management/slices/<slice_rs>/commands.rs }
    to: { root: ts, path: apps/myapp/src/task-management/shared/ipc/bindings.ts }
    generator: tauri-specta
    auto_generated: true
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
      forbidden_imports:
        - from: ui-widget
          modules: ["@tauri-apps/api/core"]
          reason: "use task-management/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
        - from: ui-page
          modules: ["@tauri-apps/api/core"]
          reason: "use task-management/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
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
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
cross_bc:
  via: [apps/myapp/src/shared/contracts, apps/myapp/src/shared/events]
  same_event_bus: true
decisions:
  platforms: [web, desktop]
  os_integration: tauri
  ui_native: web
  language: [typescript, rust]
---

# Architecture (myapp — ddd-vsa-hex / typescript-tauri)

This file is the **single source of truth** for both the TypeScript frontend
(`apps/myapp/src/`) and the Rust backend (`apps/myapp/src-tauri/src/`). Two
adapters compile it:

```bash
# TypeScript root (default)
node .apm/skills/ori-arch/scripts/export.js --adapter=eslint --root=ts
# Rust root
node .apm/skills/ori-arch/scripts/export.js --adapter=rust --root=rs
```

## Decisions

- platforms: web + desktop (Tauri 2)
- os_integration: tauri
- ui_native: web (DOM)
- language: typescript (frontend) / rust (backend)

## Roots

| id  | path                                        | language    | adapter | slice_root        | slice_subdir | public_entry |
| --- | ------------------------------------------- | ----------- | ------- | ----------------- | ------------ | ------------ |
| ts  | `apps/myapp/src`                            | typescript  | eslint  | `task-management` | `slices`     | `index.ts`   |
| rs  | `apps/myapp/src-tauri/src`                  | rust        | rust    | `task_management` | `slices`     | `mod.rs`     |

The two roots are bridged by **tauri-specta**, which derives the TS bindings
under `apps/myapp/src/task-management/shared/ipc/bindings.ts` from the
`#[tauri::command]` functions in
`apps/myapp/src-tauri/src/task_management/slices/<slice_rs>/commands.rs`.

## Layout (TypeScript)

```
apps/myapp/src/
├── task-management/
│   ├── shared/
│   │   ├── ipc/               # tauri-specta-generated bindings (regenerated on build)
│   │   ├── types/
│   │   ├── events/
│   │   └── contracts/
│   └── slices/
│       └── <slice-id>/        # 1 slice per use case
│           ├── index.ts       # PUBLIC API
│           ├── domain/
│           ├── application/
│           ├── infrastructure/
│           ├── presentation/
│           └── tests/
├── ui-widget/                 # ddd-vsa-hex ui-layer (order 1)
└── ui-page/                   # ddd-vsa-hex ui-layer (order 2)
```

## Layout (Rust)

```
apps/myapp/src-tauri/src/
├── lib.rs                       # crate root; declares `pub mod task_management`
├── main.rs                      # binary entry (delegated to `tauri init`)
└── task_management/
    ├── mod.rs                   # `pub mod shared; pub mod slices;`
    ├── shared/                  # below every slice in the dependency graph
    │   ├── mod.rs               # PUBLIC API
    │   ├── result.rs            # AppError / AppResult
    │   └── events.rs            # DomainEvent
    └── slices/
        ├── mod.rs               # `pub mod <slice_rs>;`
        └── <slice_rs>/          # one folder per backend slice
            ├── mod.rs           # PUBLIC API — only this file is `pub use`d outside
            ├── domain.rs
            ├── application.rs
            ├── infrastructure.rs
            └── commands.rs      # tauri-specta surface
```

## Rules

- **Cross-slice direct imports are prohibited.** Use
  `task-management/shared/contracts/` (TS) / `task_management::shared` (Rust)
  or domain events to collaborate across slices.
- **Each slice has exactly one public entry**: `index.ts` (TS) / `mod.rs`
  (Rust).
- UI layers form a one-way pipeline `ui-page -> ui-widget -> {shared, domain}`.
  Same-layer imports are prohibited.
- **No raw `@tauri-apps/api/core` imports from any UI layer.** Use the
  tauri-specta-generated bindings under `task-management/shared/ipc/`.
- The arch-adapter-rust enforces cross-slice and cross-layer rules by walking
  `use` statements. Cross-slice direct imports are rejected by the generated
  `tests/arch.rs`.

Regenerate after editing this file:

```bash
node .apm/skills/ori-arch/scripts/export.js --adapter=eslint --root=ts
node .apm/skills/ori-arch/scripts/export.js --adapter=rust   --root=rs
```