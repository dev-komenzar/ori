---
version: 1
default_root: ts
roots:
  - id: ts
    path: src
    language: typescript
    layer_set: feature-sliced-ts
    adapter: eslint
    feature_root: lib
    public_entry: index.ts
  - id: rs
    path: src-tauri/src
    language: rust
    layer_set: feature-sliced-rust
    adapter: rust
    feature_root: features
    public_entry: mod.rs
cross_root:
  - from: { root: rs, path: src-tauri/src/features/tasks/commands.rs }
    to:   { root: ts, path: src/lib/shared/ipc/bindings.ts }
    generator: tauri-specta
    auto_generated: true
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
        - { from: ui-page,    allow: [ui-widget, ui-feature, ui-entity, shared] }
        - { from: ui-widget,  allow: [ui-feature, ui-entity, shared] }
        - { from: ui-feature, allow: [ui-entity, shared, domain] }
        - { from: ui-entity,  allow: [shared] }
        - { from: domain,     allow: [shared] }
        - { from: shared,     allow: [] }
      same_layer: prohibited
      public_entry_required: true
      forbidden_imports:
        - from: ui-feature
          modules: ["@tauri-apps/api/core"]
          reason: "use lib/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
        - from: ui-widget
          modules: ["@tauri-apps/api/core"]
          reason: "use lib/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
        - from: ui-page
          modules: ["@tauri-apps/api/core"]
          reason: "use lib/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
        - from: ui-entity
          modules: ["@tauri-apps/api/core"]
          reason: "use lib/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
  feature-sliced-rust:
    layers:
      - { id: shared,   kind: shared }
      - { id: features, kind: feature }
    rules:
      cross_layer:
        - { from: features, allow: [shared] }
        - { from: shared,   allow: [] }
      same_layer: prohibited
      public_entry_required: true
feature_internal:
  feature-internal-ts:
    sub_layers: [presentation, application, domain, infrastructure]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain, infrastructure] }
      - { from: domain,         allow: [] }
      - { from: infrastructure, allow: [domain] }
cross_feature:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---

# Architecture (ddd-typescript-tauri template)

This file is the **single source of truth** for both the TypeScript frontend
(`src/`) and the Rust backend (`src-tauri/src/`). Two adapters compile it:

```bash
# TypeScript root (default)
pnpm exec ori arch export --adapter=eslint --root=ts
# Rust root
pnpm exec ori arch export --adapter=rust --root=rs
```

## Roots

| id  | path             | language    | adapter | feature_root | public_entry |
| --- | ---------------- | ----------- | ------- | ------------ | ------------ |
| ts  | `src`            | typescript  | eslint  | `lib`        | `index.ts`   |
| rs  | `src-tauri/src`  | rust        | rust    | `features`   | `mod.rs`     |

The two roots are bridged by **tauri-specta**, which derives the TS bindings
under `src/lib/shared/ipc/bindings.ts` from the `#[tauri::command]` functions
in `src-tauri/src/features/*/commands.rs`. This is the only sanctioned
cross-root contract; everything else stays inside its own root.

## Layout (TypeScript)

```
src/
├── lib/
│   ├── shared/              # cross-feature primitives (types, events, contracts, ipc)
│   │   ├── ipc/             # tauri-specta-generated bindings (regenerated on build)
│   │   ├── types/
│   │   ├── events/
│   │   └── contracts/
│   └── <feature>/           # `tasks/` is the worked example
│       ├── index.ts         # PUBLIC API
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       ├── presentation/
│       └── tests/
├── ui-entity/               # FSD layer 1
├── ui-feature/              # FSD layer 2 — may import lib/<feature>/index.ts
├── ui-widget/               # FSD layer 3
└── ui-page/                 # FSD layer 4
```

## Layout (Rust)

```
src-tauri/src/
├── lib.rs                   # crate root; declares `pub mod features`
├── main.rs                  # binary entry
└── features/
    ├── mod.rs               # `pub mod shared; pub mod tasks;`
    ├── shared/              # below every feature in the dependency graph
    │   ├── mod.rs           # PUBLIC API
    │   ├── result.rs        # AppError / AppResult
    │   └── events.rs        # DomainEvent
    └── tasks/               # one folder per backend feature
        ├── mod.rs           # PUBLIC API — only this file is `pub use`d outside
        ├── domain.rs
        ├── application.rs
        ├── infrastructure.rs
        └── commands.rs      # tauri-specta surface
```

## Rules

### Shared

- **Cross-feature direct imports are prohibited** on both sides.
  Use `shared/contracts/` (TS) / `features::shared` (Rust) or domain events
  to collaborate across features.
- **Each feature has exactly one public entry**: `index.ts` (TS) / `mod.rs` (Rust).

### TypeScript-specific

- UI layers form a one-way pipeline
  `ui-page → ui-widget → ui-feature → ui-entity → shared`.
- **`ui-feature` is the only UI layer permitted to import a domain feature**
  (`lib/<feature>/index.ts`).
- Same-layer imports are prohibited.
- **No raw `@tauri-apps/api/core` imports from any UI layer.** Use the
  tauri-specta-generated bindings under `lib/shared/ipc/`. The eslint adapter
  emits a `no-restricted-imports` rule that fails the build on raw `invoke`
  calls — sourced from `forbidden_imports` in the frontmatter above.

### Rust-specific

- The arch-adapter-rust enforces cross-feature and cross-layer rules by
  walking `use` statements. `crate::*`, `super::*`, and `self::*` are all
  resolved against the Rust 2018+ module-file convention.
- Cross-feature direct imports (e.g., `crate::features::projects` from
  inside `features::tasks`) are rejected by the generated `tests/arch.rs`.

Regenerate after editing this file:

```bash
pnpm exec ori arch export --adapter=eslint --root=ts
pnpm exec ori arch export --adapter=rust   --root=rs
```
