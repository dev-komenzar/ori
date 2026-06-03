# @ori-ori/templates

Code-generation templates used by `ori init --template <name>` and by
phase 4 (`impl-green`) of `ori feature run`.

## Templates

- **ddd-vsa-hex-typescript** — minimal DDD-VSA-Hex TypeScript scaffold
  aligned with `docs/design.md` §6 / §12 / §17.
  - `apps/template-app/src/<bc>/slices/<slice-id>/{domain,application,infrastructure,presentation,tests}`
  - `apps/template-app/src/<bc>/shared/{types,events,contracts}` for
    BC-internal cross-slice primitives
  - each slice exposes only `index.ts` as its public API
  - UI composition is the two-layer `ui-page -> ui-widget` pipeline
  - `.ori/architecture.md` is the SSoT (uses `slice_root: <bc>` and
    `slice_subdir: slices`); `eslint.config.ori.js` is generated from it
    via `@ori-ori/arch-adapter-eslint`
  - ships a worked `task-management/complete-task` slice + vitest specs

- **ddd-vsa-hex-typescript-tauri** — Tauri 2 derivative of
  `ddd-vsa-hex-typescript`.
  - mirrors the TS-side slice/UI layout under `apps/template-app/src/`
  - adds a Rust DDD-VSA-Hex backend at
    `apps/template-app/src-tauri/src/<bc>/slices/<slice-id>/` with
    `mod.rs` as the sole public entry
  - multi-root `.ori/architecture.md` (ts + rs); compiled by
    `@ori-ori/arch-adapter-eslint` and `@ori-ori/arch-adapter-rust`
  - `tauri-specta` cross-root contract emits
    `apps/template-app/src/lib/shared/ipc/bindings.ts` from the Rust
    `commands.rs` of each slice

See each template's `README.md` for the full layout.
