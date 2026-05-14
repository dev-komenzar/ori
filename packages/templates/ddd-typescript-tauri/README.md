# ddd-typescript-tauri template

A feature-sliced TypeScript + Rust (Tauri 2) DDD scaffold. Derives from
`ddd-typescript` and adds a Rust backend under `src-tauri/` plus a
`tauri-specta` cross-root contract that auto-generates TS bindings.

The TS<->Rust language boundary IS the cross-feature isolation boundary —
enforced physically, not by lint. Each root in `.ori/architecture.md` picks
its own adapter (eslint for TS, arch-adapter-rust for Rust).

## Layout

```
<project>/
├── .ori/architecture.md          # SSoT — two roots: ts + rs
├── eslint.config.js              # spreads ./eslint.config.ori.js (ts root)
├── vitest.config.ts
├── tsconfig.json
├── src/                          # TS frontend (FSD)
│   ├── lib/
│   │   ├── shared/
│   │   │   ├── ipc/              # tauri-specta-generated bindings
│   │   │   ├── types/
│   │   │   ├── events/
│   │   │   └── contracts/
│   │   └── tasks/                # one worked domain feature (TS side)
│   ├── ui-entity/                # FSD layer 1
│   ├── ui-feature/               # FSD layer 2 — may call lib/<feature>
│   ├── ui-widget/                # FSD layer 3
│   └── ui-page/                  # FSD layer 4
└── src-tauri/                    # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    └── src/
        ├── lib.rs
        ├── main.rs
        └── features/
            ├── shared/
            └── tasks/            # mirrors the TS feature
```

## Getting started

```bash
pnpm install
pnpm arch:export                 # regenerate eslint.config.ori.js + tests/arch.rs
pnpm test                        # TS tests (vitest)
pnpm test:rs                     # Rust tests (cargo)
pnpm tauri dev                   # also regenerates src/lib/shared/ipc/bindings.ts
```

## Conventions

### TypeScript frontend (same as ddd-typescript)

- **Value Objects** are branded types with a Smart Constructor returning
  `Result<T, Error>`.
- **Aggregates** are pure: command functions take state, return
  `{ state, events }`.
- **Public API**: a feature's `index.ts` is the only file that may be
  imported from outside the feature.
- **UI layers** flow one-way: `ui-page → ui-widget → ui-feature → ui-entity → shared`.
  Only `ui-feature` may import a domain feature (`lib/<feature>/index.ts`)
  or a Rust command via `lib/shared/ipc/bindings.ts`.

### Rust backend

- Each feature folder owns its own pipeline: `domain.rs → application.rs →
  infrastructure.rs → commands.rs`.
- **`mod.rs` is the public API** for the feature. The crate root re-exports
  feature modules; anything outside `mod.rs` is feature-internal.
- **Tauri commands** (`#[tauri::command] #[specta::specta]`) live in
  `commands.rs`. `tauri-specta` collects them at build time and emits
  `src/lib/shared/ipc/bindings.ts` (the only cross-root artifact).
- Use idiomatic `super::*` for sibling modules inside a feature; reach for
  `crate::features::shared::*` only when you need a shared primitive.

### Cross-feature collaboration

- **Direct imports across features are prohibited** on both sides. Declare
  a contract in `shared/contracts/` (TS) or `features::shared` (Rust), or
  publish a domain event, and have both sides depend on the contract.

## Customising

Edit `.ori/architecture.md` to add layers, features, or change rules; then:

```bash
pnpm arch:export
```

The generated files (`eslint.config.ori.js`, `src-tauri/tests/arch.rs`) are
in `.gitignore` by default — the spec is the source of truth.
