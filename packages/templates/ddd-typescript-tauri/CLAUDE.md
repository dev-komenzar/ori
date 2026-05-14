# Project Instructions for Claude Code

Read this on every session start. The machine-readable source of truth for
the architecture is [.ori/architecture.md](.ori/architecture.md); this file
narrates the *intent* and lists the rules AI agents most often violate.

## What this project is

A feature-sliced TypeScript + Rust (Tauri 2) app scaffolded from
`@ori-ori/templates/ddd-typescript-tauri`. The TS<->Rust language boundary
is the cross-feature isolation boundary — enforced physically by the
compiler, not by lint.

```
src/                         # TS frontend (FSD)
├── lib/<feature>/           # domain feature; index.ts is the SOLE public API
├── lib/shared/ipc/          # tauri-specta-generated bindings — DO NOT edit by hand
├── ui-entity / ui-feature / ui-widget / ui-page  # FSD layers
src-tauri/src/
├── lib.rs                   # ori overlay (tauri-specta wiring)
└── features/<feature>/      # mirror of TS side; mod.rs is the SOLE public API
```

## Hard rules (lint-enforced — violating these fails the build)

### TypeScript

1. **No raw `@tauri-apps/api/core` imports from any UI layer.**
   Use the generated bindings:
   ```ts
   // ✅ DO
   import { completeTaskCmd } from "../../lib/shared/ipc/bindings";
   // ❌ DON'T
   import { invoke } from "@tauri-apps/api/core";
   ```
   The eslint adapter compiles `forbidden_imports` from
   `.ori/architecture.md` into `no-restricted-imports` overrides.

2. **A feature's `index.ts` is the only file importable from outside the
   feature.** Reach into `lib/tasks/domain/task.ts` from a UI layer and
   `boundaries/no-private` will fail.

3. **UI layers flow one-way**:
   `ui-page → ui-widget → ui-feature → ui-entity → shared`. Same-layer
   imports are prohibited.

4. **Only `ui-feature` may import a domain feature**
   (`lib/<feature>/index.ts`). Other UI layers must go through the entity
   layer or the shared ipc bindings.

### Rust

1. **Cross-feature direct imports are prohibited.** From
   `features::tasks` you may not write `use crate::features::projects::*`.
   Collaborate via `features::shared` or domain events.

2. **`mod.rs` is the sole public API of a feature.** Outside the feature,
   only items re-exported in `mod.rs` are visible.

3. **All `#[tauri::command]` functions live in `commands.rs`** of their
   feature folder. Don't scatter `#[tauri::command]` attributes across
   files — `collect_commands![...]` in `src-tauri/src/lib.rs` references
   `features::<feature>::<cmd>` paths and assumes this convention.

## Feature-internal layering

Each feature folder has a one-way internal pipeline:

```
presentation → application → domain ← infrastructure
```

- `domain/` is pure (no I/O, no framework deps).
- `application/` orchestrates domain functions; depends on `domain`,
  `infrastructure`.
- `infrastructure/` implements ports from `domain` (e.g., repositories).
- `presentation/` is the TS UI-facing facade; on the Rust side, this is
  `commands.rs` (the tauri-specta surface).

## Regenerating tauri-specta bindings

The TS file `src/lib/shared/ipc/bindings.ts` is **generated** from the
Rust `#[tauri::command]` functions. Whenever you add, rename, or remove
a command:

```bash
pnpm tauri dev    # regenerates bindings.ts on each debug build
```

Then commit the regenerated `bindings.ts`. CI's `bindings:check` fails the
PR if the committed file is stale. Editing `bindings.ts` by hand is a
waste of time — `tauri dev` will overwrite it.

## Adding a new command (end-to-end recipe)

1. Define inputs/outputs and the function in
   `src-tauri/src/features/<feature>/application.rs` (pure or
   `async fn` over your domain types).
2. Add a `#[tauri::command] #[specta::specta]` wrapper in
   `src-tauri/src/features/<feature>/commands.rs`, calling the
   application function.
3. Add the new command path (e.g., `features::<feature>::<cmd>`) to
   the `collect_commands![...]` macro in `src-tauri/src/lib.rs`.
4. Run `pnpm tauri dev` once → `bindings.ts` updates.
5. Consume the binding from `src/ui-feature/<feature>/...` only.

## Adding a new feature

```bash
pnpm exec ori feature new <feature-id>
```

This creates the TS skeleton under `src/lib/<feature-id>/`. The Rust side
is manual: create `src-tauri/src/features/<feature-id>/{mod.rs,
domain.rs, application.rs, infrastructure.rs, commands.rs}` and add
`pub mod <feature-id>;` to `features/mod.rs`. The `mod.rs` re-exports the
public surface (and only the public surface).

## Cross-feature collaboration

Direct imports across features are prohibited on both sides. Use:
- **TS**: types in `src/lib/shared/contracts/`, events in
  `src/lib/shared/events/`.
- **Rust**: types in `features::shared`, events in
  `features::shared::events`.

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
