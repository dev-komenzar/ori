# @ori-ori/templates

Code-generation templates used by `ori init --template <name>` and by
phase 4 (`impl-green`) of `ori feature run`.

## Templates

- **ddd-typescript** — minimal feature-sliced TypeScript DDD scaffold.
  - `src/lib/<feature>/{domain,application,infrastructure,presentation,tests}`
  - `src/lib/shared/{types,events,contracts}` for cross-feature primitives
  - one feature exposes only `index.ts` as its public API
  - `.ori/architecture.md` is the SSoT; `eslint.config.ori.js` is generated
    from it via `@ori-ori/arch-adapter-eslint`
  - ships a worked `tasks` aggregate + vitest specs

- **ddd-typescript-tauri** — Tauri 2 derivative of `ddd-typescript`.
  - mirrors the TS-side feature/UI layout
  - adds a Rust feature-sliced backend at `src-tauri/src/features/<f>/`
    with `mod.rs` as the sole public entry
  - multi-root `.ori/architecture.md` (ts + rs); compiled by
    `@ori-ori/arch-adapter-eslint` and `@ori-ori/arch-adapter-rust`
  - `tauri-specta` cross-root contract emits `src/lib/shared/ipc/bindings.ts`
    from the Rust `commands.rs` of each feature

See each template's `README.md` for the full layout.
