# Project Instructions for Claude Code

Read this on every session start. The machine-readable source of truth for
the architecture is [.ori/architecture.md](.ori/architecture.md); this file
narrates the *intent* and lists the rules AI agents most often violate.

## What this project is

A DDD-VSA-Hex TypeScript + Rust (Tauri 2) app scaffolded from
`@ori-ori/templates/ddd-vsa-hex-typescript-tauri`. The TS<->Rust language
boundary is the cross-slice isolation boundary — enforced physically by
the compiler, not by lint.

```
apps/<app>/src/                          # TS frontend (ddd-vsa-hex)
├── <bc>/
│   ├── shared/
│   │   ├── ipc/                         # tauri-specta-generated bindings — DO NOT edit by hand
│   │   ├── types/ events/ contracts/
│   └── slices/<slice-id>/               # one folder per use case; index.ts is the SOLE public API
├── ui-widget/                           # ddd-vsa-hex ui-layer (order 1)
└── ui-page/                             # ddd-vsa-hex ui-layer (order 2)
apps/<app>/src-tauri/src/
├── lib.rs                               # ori overlay (tauri-specta wiring)
└── <bc>/                                # Rust BC mirror (underscored name)
    ├── shared/
    └── slices/<slice_id>/               # mod.rs is the SOLE public API
```

## Hard rules (lint-enforced — violating these fails the build)

### TypeScript

1. **No raw `@tauri-apps/api/core` imports from any UI layer.**
   Use the generated bindings:
   ```ts
   // ✅ DO
   import { completeTaskCmd } from "../../task-management/shared/ipc/bindings";
   // ❌ DON'T
   import { invoke } from "@tauri-apps/api/core";
   ```
   The eslint adapter compiles `forbidden_imports` from
   `.ori/architecture.md` into `no-restricted-imports` overrides.

2. **A slice's `index.ts` is the only file importable from outside the
   slice.** Reach into
   `task-management/slices/complete-task/domain/task.ts` from a UI layer
   and `boundaries/no-private` will fail.

3. **UI layers flow one-way**: `ui-page -> ui-widget -> {shared, domain}`.
   Same-layer imports are prohibited.

4. **UI layers reach the domain only via a slice's public `index.ts`**.
   No deep imports into slice internals.

### Rust

1. **Cross-slice direct imports are prohibited.** From
   `task_management::slices::complete_task` you may not write
   `use crate::task_management::slices::other::*`. Collaborate via
   `task_management::shared` or domain events.

2. **`mod.rs` is the sole public API of a slice.** Outside the slice,
   only items re-exported in `mod.rs` are visible.

3. **All `#[tauri::command]` functions live in `commands.rs`** of their
   slice folder. Don't scatter `#[tauri::command]` attributes across
   files — `collect_commands![...]` in
   `apps/<app>/src-tauri/src/lib.rs` references
   `<bc>::slices::<slice>::<cmd>` paths and assumes this convention.

## Slice-internal layering

Each slice folder has a one-way internal pipeline:

```
presentation -> application -> domain
infrastructure -> domain
```

- `domain/` is pure (no I/O, no framework deps).
- `application/` orchestrates domain functions; depends only on `domain/`.
- `infrastructure/` implements ports from `domain` (e.g., repositories).
- `presentation/` is the TS UI-facing facade; on the Rust side, this is
  `commands.rs` (the tauri-specta surface).

## Regenerating tauri-specta bindings

The TS file `apps/<app>/src/<bc>/shared/ipc/bindings.ts` is **generated**
from the Rust `#[tauri::command]` functions. Whenever you add, rename, or
remove a command:

```bash
pnpm tauri dev    # regenerates bindings.ts on each debug build
```

Then commit the regenerated `bindings.ts`. CI's `bindings:check` fails the
PR if the committed file is stale. Editing `bindings.ts` by hand is a
waste of time — `tauri dev` will overwrite it.

## Adding a new command (end-to-end recipe)

1. Define inputs/outputs and the function in
   `apps/<app>/src-tauri/src/<bc>/slices/<slice>/application.rs` (pure
   or `async fn` over your domain types).
2. Add a `#[tauri::command] #[specta::specta]` wrapper in
   `apps/<app>/src-tauri/src/<bc>/slices/<slice>/commands.rs`, calling
   the application function.
3. Add the new command path (e.g.
   `task_management::slices::complete_task::complete_task_cmd`) to
   the `collect_commands![...]` macro in
   `apps/<app>/src-tauri/src/lib.rs`.
4. Run `pnpm tauri dev` once → `bindings.ts` updates.
5. Consume the binding from `apps/<app>/src/ui-widget/<slice>/...` only
   (or other UI layers that are allowed by `cross_layer`).

## Adding a new slice

```bash
pnpm exec ori feature new <slice-id>
```

This creates the TS skeleton under
`apps/<app>/src/<bc>/slices/<slice-id>/`. The Rust side is manual:
create `apps/<app>/src-tauri/src/<bc>/slices/<slice_id>/{mod.rs,
domain.rs, application.rs, infrastructure.rs, commands.rs}` and add
`pub mod <slice_id>;` to `<bc>/slices/mod.rs`. The `mod.rs` re-exports
the public surface (and only the public surface).

## Cross-slice collaboration

Direct imports across slices are prohibited on both sides. Use:
- **TS**: types in `apps/<app>/src/<bc>/shared/contracts/`, events in
  `apps/<app>/src/<bc>/shared/events/`.
- **Rust**: types in `<bc>::shared`, events in
  `<bc>::shared::events`.

## Regenerating architecture artifacts

`.ori/architecture.md` is the SSoT. After editing it:

```bash
pnpm arch:export        # regenerates eslint.config.ori.js + src-tauri/tests/arch.rs
```

The generated files are gitignored — recompile rather than edit.

## Quality gates (run before "done")

```bash
pnpm lint               # eslint with the ori-generated boundaries config
pnpm typecheck
pnpm test               # vitest (TS)
pnpm test:rs            # cargo test (Rust, includes generated arch tests)
pnpm bindings:check     # CI also runs this — bindings.ts must be fresh
```
