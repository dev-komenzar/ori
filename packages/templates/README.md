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

See `ddd-typescript/README.md` for the full layout.

## Roadmap

- `ddd-typescript-tauri` — Tauri 2 derivative of `ddd-typescript` with a Rust
  feature-sliced backend and `tauri-specta`-generated contracts. Deferred
  past v0.1 (tracked separately).
